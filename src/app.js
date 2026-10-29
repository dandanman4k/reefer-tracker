import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getAdmin, getAuthClient, isConfigured, typesenseConfigured } from './config.js';
import { serializeSample, serializeProfile, publicRecipient, serializeTransfer, SAFE_FIELDS, TECH_FIELDS } from './privacy.js';
import { bad, isUUID, requiredString, optionalString, samplePayload } from './validate.js';
import { ensureCollection, searchIds, syncSample } from './typesense.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
app.use(cors({ origin(origin, cb) { cb(null, !origin || allowedOrigins.includes(origin)); } }));
app.use(express.json({ limit: '64kb' }));
app.use(morgan('tiny'));
const go = handler => (req,res,next) => Promise.resolve().then(() => handler(req,res)).catch(next);
const check = (data, error) => { if (error) throw bad(error.message, 400); return data; };
const sha = value => createHash('sha256').update(value).digest('hex');
const equalDigest = (a,b) => timingSafeEqual(Buffer.from(a),Buffer.from(b));

async function auth(req, _res, next) {
  try {
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
    if (!match) throw bad('Authorization required', 401);
    const { data: { user }, error } = await getAdmin().auth.getUser(match[1]);
    if (error || !user) throw bad('Session expired. Sign in again.', 401);
    const { data: profile, error: profileErr } = await getAdmin().from('profiles')
      .select('id,organization_id,full_name,email,phone,role,active').eq('id',user.id).maybeSingle();
    if (profileErr || !profile || !profile.active) throw bad('Account is inactive or incomplete', 403);
    req.actor = profile;
    next();
  } catch(e) { next(e); }
}
const requireTechnician = (req,_res,next) => req.actor.role === 'technician' ? next() : next(bad('Technician access required',403));

const sampleFields = role => role === 'technician' ? TECH_FIELDS : SAFE_FIELDS;
async function sampleFor(req, id) {
  if (!isUUID(id)) throw bad('Invalid sample id');
  const {data,error} = await getAdmin().from('samples').select(sampleFields(req.actor.role))
    .eq('id',id).eq('organization_id',req.actor.organization_id)
    .eq('active_holder_id',req.actor.id).maybeSingle();
  if (error) throw bad('Unable to fetch sample',500);
  if (!data) throw bad('Sample not found in your custody',404);
  return data;
}
async function namesFor(orgId, ids) {
  if (!ids.length) return {};
  const {data,error} = await getAdmin().from('profiles').select('id,full_name')
    .eq('organization_id',orgId).in('id',[...new Set(ids)]);
  if (error) throw bad('Could not fetch user names',500);
  return Object.fromEntries(data.map(p => [p.id,p.full_name]));
}
async function detailedTransferRows(req, transfers) {
  const names = await namesFor(req.actor.organization_id,transfers.flatMap(t => [t.sender_id,t.receiver_id]));
  return transfers.map(row => serializeTransfer(row,names));
}

app.get('/api/health', (_req,res) => res.json({app:'Reefer Track', status:'ok',supabase_configured:isConfigured(), typesense_configured:typesenseConfigured()}));

app.post('/api/auth/signup', go(async (req,res) => {
  const b = req.body || {};
  const fullName = requiredString(b.full_name,'full_name',120);
  const email = requiredString(b.email,'email',200).toLowerCase();
  const password = requiredString(b.password,'password',200);
  const phone = requiredString(b.phone,'phone',40);
  const organization = requiredString(b.organization,'organization',120);
  const role = b.role;
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !['courier','technician'].includes(role)) throw bad('Invalid signup fields');
  const admin = getAdmin();
  const {data: org, error: orgError} = await admin.from('organizations').select('id,join_code_hash').ilike('name',organization).maybeSingle();
  if (orgError) throw bad('Could not verify organization',500);
  if (org) {
    const entered = optionalString(b.join_code,'join_code',100);
    if (!entered || !equalDigest(sha(entered),org.join_code_hash)) throw bad('Join code required for an existing organization',403);
  }
  const authClient = getAuthClient();
  const {data: signed, error} = await authClient.auth.signUp({ email, password });
  if (error || !signed.user) throw bad(error?.message || 'Unable to sign up',400);
  let orgId = org?.id;
  let generatedCode = null;
  try {
    if (!orgId) {
      generatedCode = randomBytes(12).toString('base64url');
      const result = await admin.from('organizations').insert({name:organization,join_code_hash:sha(generatedCode)}).select('id').single();
      if (result.error) throw bad(result.error.message,400);
      orgId = result.data.id;
    }
    const result = await admin.from('profiles').insert({
      id:signed.user.id, organization_id:orgId, full_name:fullName,email,phone,role
    });
    if (result.error) throw bad(result.error.message,400);
  } catch(e) {
    // Supabase may create an account without a session while email confirmation is pending.
    // On profile failure remove that newly-created account so signup may be retried.
    await admin.auth.admin.deleteUser(signed.user.id).catch(() => {});
    throw e;
  }
  res.status(201).json({
    message: signed.session ? 'Account created' : 'Account created. Verify your email before logging in.',
    requires_email_confirmation: !signed.session,
    organization_join_code: generatedCode,
    session: signed.session ? {access_token:signed.session.access_token,refresh_token:signed.session.refresh_token} : null,
    user: signed.session ? {id:signed.user.id,full_name:fullName,email,phone,role,organization_id:orgId,active:true} : null
  });
}));

app.post('/api/auth/login', go(async (req,res) => {
  const identifier = requiredString(req.body?.identifier,'identifier',200);
  const password = requiredString(req.body?.password,'password',200);
  let email = identifier;
  if (!identifier.includes('@')) {
    if (/[%,_*]/.test(identifier)) throw bad('Use email for this account',400);
    const {data,error} = await getAdmin().from('profiles').select('email').ilike('full_name',identifier).limit(2);
    if (error || !data || data.length !== 1) throw bad('Name not unique or not found. Use email to sign in.',400);
    email = data[0].email;
  }
  const {data,error} = await getAuthClient().auth.signInWithPassword({email,password});
  if (error || !data.session) throw bad('Incorrect login details',401);
  const {data: profile} = await getAdmin().from('profiles').select('*').eq('id',data.user.id).maybeSingle();
  if (!profile?.active) throw bad('Account unavailable',403);
  res.json({session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token},user:serializeProfile(profile)});
}));
app.post('/api/auth/refresh', go(async (req,res) => {
  const refreshToken = requiredString(req.body?.refresh_token,'refresh_token',3000);
  const {data,error} = await getAuthClient().auth.refreshSession({refresh_token:refreshToken});
  if (error || !data.session) throw bad('Please log in again',401);
  res.json({session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token}});
}));
app.get('/api/me',auth, (req,res) => res.json({user:serializeProfile(req.actor)}));

app.get('/api/users',auth,go(async (req,res) => {
  const q = String(req.query.q || '').trim().slice(0,80);
  let query = getAdmin().from('profiles').select('id,full_name,role').eq('organization_id',req.actor.organization_id)
    .eq('active',true).neq('id',req.actor.id).order('full_name').limit(50);
  if (q) query = query.ilike('full_name',`%${q.replace(/[%,_]/g,'')}%`);
  const {data,error} = await query;
  if (error) throw bad('Could not find recipients',500);
  res.json({users:data.map(publicRecipient)});
}));

app.get('/api/samples',auth,go(async (req,res) => {
  const q = String(req.query.q || '').trim().slice(0,100);
  const admin = getAdmin();
  const columns = sampleFields(req.actor.role);
  let rows;
  let searchEngine = 'postgres';
  if (q) {
    if (!typesenseConfigured() && process.env.ALLOW_SQL_SEARCH_FALLBACK !== 'true')
      throw bad('Typesense search has not been configured on the server',503);
    if (typesenseConfigured()) {
      try {
        const ids = await searchIds(q,req.actor);
        if (!ids.length) return res.json({samples:[],search_engine:'typesense'});
        const {data,error} = await admin.from('samples').select(columns).in('id',ids)
          .eq('organization_id',req.actor.organization_id).eq('active_holder_id',req.actor.id);
        if (error) throw error;
        rows = ids.map(id => data.find(x => x.id === id)).filter(Boolean);
        searchEngine = 'typesense';
      } catch(e) {
        if (process.env.ALLOW_SQL_SEARCH_FALLBACK !== 'true') throw bad('Typesense search unavailable; check the index and credentials',503);
      }
    }
    if (!rows) {
      const escaped = q.replace(/[^a-zA-Z0-9 -]/g,'');
      const {data,error} = await admin.from('samples').select(columns)
        .eq('organization_id',req.actor.organization_id).eq('active_holder_id',req.actor.id)
        .or(`tracking_code.ilike.%${escaped}%,patient_first_name.ilike.%${escaped}%,specimen_type.ilike.%${escaped}%`)
        .order('collected_at',{ascending:false}).limit(100);
      if (error) throw bad('Search failed',500);
      rows = data;
    }
  } else {
    const {data,error} = await admin.from('samples').select(columns)
      .eq('organization_id',req.actor.organization_id).eq('active_holder_id',req.actor.id)
      .order('collected_at',{ascending:false}).limit(200);
    if (error) throw bad('Unable to load samples',500);
    rows = data;
  }
  res.json({samples:rows.map(x => serializeSample(x,req.actor.role)),search_engine:searchEngine});
}));

app.post('/api/samples',auth,requireTechnician,go(async (req,res) => {
  const data = samplePayload(req.body);
  const row = {
    ...data, id:randomUUID(), tracking_code:`RT-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`,
    organization_id:req.actor.organization_id, active_holder_id:req.actor.id, created_by:req.actor.id
  };
  const result = await getAdmin().from('samples').insert(row).select('*').single();
  if (result.error) throw bad(result.error.message,400);
  let warning = null;
  if (typesenseConfigured()) {
    try { await ensureCollection(); await syncSample(result.data); }
    catch(e) { warning = 'Saved to Supabase, but Typesense indexing failed. Run npm run reindex.'; console.error('Typesense sync:',e); }
  } else warning = 'Saved, but Typesense is not configured.';
  res.status(201).json({sample:serializeSample(result.data,req.actor.role),search_warning:warning});
}));

app.get('/api/samples/:id',auth,go(async (req,res) => {
  const sample = await sampleFor(req,req.params.id);
  res.json({sample:serializeSample(sample,req.actor.role)});
}));

app.get('/api/samples/:id/history',auth,go(async (req,res) => {
  await sampleFor(req,req.params.id); // Access check always precedes history fetch.
  const {data,error} = await getAdmin().from('sample_transfers')
    .select('id,sample_id,sender_id,receiver_id,requested_at,responded_at,accepted,declined')
    .eq('sample_id',req.params.id).order('requested_at');
  if (error) throw bad('Could not load custody history',500);
  res.json({transfers:await detailedTransferRows(req,data)});
}));

app.get('/api/inbox',auth,go(async (req,res) => {
  const {data,error} = await getAdmin().from('sample_transfers')
    .select('id,sample_id,sender_id,receiver_id,requested_at,responded_at,accepted,declined')
    .or(`receiver_id.eq.${req.actor.id},sender_id.eq.${req.actor.id}`)
    .order('requested_at',{ascending:false}).limit(100);
  if (error) throw bad('Could not load inbox',500);
  // Verify both ends are in user's organization even if old records were moved.
  const names = await namesFor(req.actor.organization_id,data.flatMap(t=>[t.sender_id,t.receiver_id]));
  const transfers = data.filter(t=>names[t.sender_id] && names[t.receiver_id]);
  const sampleIds = [...new Set(transfers.map(x=>x.sample_id))];
  // Only safe summary fields for BOTH roles when displayed in inbox (recipient not yet custodian).
  const {data: summaries,error: sampleError} = sampleIds.length ? await getAdmin().from('samples')
    .select(SAFE_FIELDS).in('id',sampleIds).eq('organization_id',req.actor.organization_id) : {data:[],error:null};
  if (sampleError) throw bad('Could not load inbox samples',500);
  const map = Object.fromEntries(summaries.map(s=>[s.id,serializeSample(s,'courier')]));
  res.json({transfers:transfers.map(t=>({...serializeTransfer(t,names), sample:map[t.sample_id] || null}))});
}));

app.post('/api/transfers',auth,go(async (req,res) => {
  const receiver = req.body?.receiver_id;
  const ids = req.body?.sample_ids;
  if (!isUUID(receiver) || !Array.isArray(ids) || ids.length<1 || ids.length>100 || !ids.every(isUUID)) throw bad('Invalid transfer request');
  const {data,error} = await getAdmin().rpc('request_sample_transfers',{
    p_sender:req.actor.id,p_receiver:receiver,p_sample_ids:ids
  });
  if (error) throw bad(error.message,409);
  res.status(201).json({count:data.length,transfers:await detailedTransferRows(req,data)});
}));

app.post('/api/transfers/:id/respond',auth,go(async (req,res) => {
  if (!isUUID(req.params.id) || typeof req.body?.accept !== 'boolean') throw bad('Invalid transfer response');
  const {data,error} = await getAdmin().rpc('respond_sample_transfer',{
    p_actor:req.actor.id,p_transfer_id:req.params.id,p_accept:req.body.accept
  });
  if (error) throw bad(error.message,409);
  let warning = null;
  if (data.accepted && typesenseConfigured()) {
    const result = await getAdmin().from('samples').select('id,tracking_code,patient_first_name,container_type,storage_type,specimen_type,organization_id,active_holder_id').eq('id',data.sample_id).single();
    if (result.error) warning='Custody updated, but search index is not synchronized.';
    else try { await syncSample(result.data); } catch(e) {console.error(e); warning='Custody updated, but search index is not synchronized.';}
  }
  res.json({transfer:(await detailedTransferRows(req,[data]))[0],search_warning:warning});
}));

app.get('/api/samples/:id/fhir',auth,requireTechnician,go(async(req,res)=>{
  const s = await sampleFor(req,req.params.id);
  const fhir = {
    resourceType:'Specimen', id:s.id,
    identifier:[{system:'https://reefertrack.example/specimen',value:s.tracking_code}],
    accessionIdentifier:{value:s.tracking_code},status:s.specimen_status,
    type:{text:s.specimen_type},
    ...(s.patient_reference ? {subject:{reference:`Patient/${s.patient_reference}`}} : {}),
    ...(s.received_at ? {receivedTime:s.received_at} : {}),
    ...(s.request_reference ? {request:[{reference:`ServiceRequest/${s.request_reference}`}]} : {}),
    collection:{collectedDateTime:s.collected_at,method:{text:s.collection_method},bodySite:{text:s.body_site}},
    container:[{identifier:s.container_id?[{value:s.container_id}]:[],type:{text:s.container_type},
      ...(s.quantity_value!=null ? {specimenQuantity:{value:s.quantity_value,unit:s.quantity_unit}} : {})}],
    ...(s.clinical_notes ? {note:[{text:s.clinical_notes}]} : {})
  };
  res.json(fhir);
}));

app.use((err,_req,res,_next)=>{
  const status = Number(err.status) || (err.type==='entity.too.large' ? 413 : 500);
  if(status>=500) console.error('API error:',err);
  res.status(status).json({error:status>=500 ? (err.status ? err.message : 'Internal server error') : err.message});
});
export default app;
