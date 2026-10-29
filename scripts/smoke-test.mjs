// Integration smoke test. Start API, seed demo users, run `node scripts/smoke-test.mjs`.
const base = process.env.SMOKE_API_URL || 'http://localhost:3000';
async function call(path,method='GET',token,body) {
  const res = await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{'Authorization':`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
  return {code:res.status,data:await res.json()};
}
const {data: auth} = await call('/api/auth/login','POST',null,{identifier:'courier@reefertrack.demo',password:'Demo1234!'});
if(!auth.session?.access_token)throw Error('Seed courier login failed');
const token=auth.session.access_token;
const list=await call('/api/samples','GET',token);
if(list.code!==200 || !list.data.samples?.length)throw Error('No seeded samples visible');
const sample=list.data.samples[0];
const forbidden=['patient_last_name','patient_reference','requested_test','clinical_notes','body_site','priority'];
for(const key of forbidden) if(key in sample)throw Error(`Courier data leak: ${key}`);
const detail=await call(`/api/samples/${sample.id}`,'GET',token);
if(detail.code!==200)throw Error('Sample detail failed');
for(const key of forbidden) if(key in detail.data.sample)throw Error(`Courier details leak: ${key}`);
const create=await call('/api/samples','POST',token,{patient_first_name:'Test',specimen_type:'Blood',container_type:'Tube',storage_type:'Ambient'});
if(create.code!==403)throw Error(`Courier create must be forbidden; got ${create.code}`);
const query=await call('/api/samples?q=RT-UG','GET',token);
if(query.code!==200 || query.data.search_engine!=='typesense')throw Error('Typesense is not configured/indexed properly');
for(const row of query.data.samples||[])for(const key of forbidden)if(key in row)throw Error(`Typesense data leak: ${key}`);
console.log('PASS: courier privacy, sample ownership, create denial, Typesense integration');
