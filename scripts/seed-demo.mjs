import 'dotenv/config';
import { createHash } from 'node:crypto';
import { getAdmin, typesenseConfigured } from '../src/config.js';
import { ensureCollection, syncSample } from '../src/typesense.js';
const db = getAdmin();
const orgId = '20000000-0000-4000-8000-000000000001';
const joinCode = 'REEFER-DEMO-2026';
const pass = 'Demo1234!';
const users = [
  {key:'tech',full_name:'Dr. Sarah Nakato',email:'technician@reefertrack.demo',phone:'+256700111001',role:'technician'},
  {key:'courier',full_name:'Daniel Kato',email:'courier@reefertrack.demo',phone:'+256700111002',role:'courier'},
  {key:'tech2',full_name:'Grace Achieng',email:'grace@reefertrack.demo',phone:'+256700111003',role:'technician'},
  {key:'courier2',full_name:'Paul Ssemanda',email:'paul@reefertrack.demo',phone:'+256700111004',role:'courier'},
];
const digest = createHash('sha256').update(joinCode).digest('hex');
async function upsert(table,rows) {
  const {error}=await db.from(table).upsert(rows,{onConflict:'id'});
  if(error)throw Error(`${table}: ${error.message}`);
}
const o = await db.from('organizations').upsert({id:orgId,name:'Reefer Demo Lab',join_code_hash:digest},{onConflict:'id'});
if(o.error)throw Error(o.error.message);
// Use Admin Auth API: manual inserts into auth.users can break Supabase Auth.
const listing = await db.auth.admin.listUsers({page:1,perPage:1000});
if(listing.error)throw listing.error;
const idByKey = {};
for(const user of users) {
  let authUser = listing.data.users.find(u=>u.email===user.email);
  if(!authUser) {
    const created = await db.auth.admin.createUser({email:user.email,password:pass,email_confirm:true});
    if(created.error)throw created.error;
    authUser = created.data.user;
  }
  idByKey[user.key]=authUser.id;
  await upsert('profiles',[{id:authUser.id,organization_id:orgId,full_name:user.full_name,email:user.email,phone:user.phone,role:user.role,active:true}]);
}
console.log('Demo accounts ready, password for each:',pass);
if (process.argv.includes('--accounts-only')) {
  console.log('Accounts-only mode. Run supabase/demo_data.sql in the SQL editor to insert mock sample records.');
  process.exit(0);
}
const sid = i => `30000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const tid = i => `40000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const base = {
  organization_id:orgId,created_by:idByKey.tech, specimen_status:'available',
  priority:'routine', body_site:'', collection_method:'Venipuncture',
  collector_name:'Dr. Sarah Nakato', received_at:null, storage_instructions:'Maintain recommended temperature; protect from heat.',
  quantity_value:4,quantity_unit:'mL',request_reference:'SR-204',clinical_notes:'Demo only. Do not enter real patient data.',
  temperature_min_c:2,temperature_max_c:8
};
const samples = [
  {id:sid(1),tracking_code:'RT-UG-1001',active_holder_id:idByKey.courier,patient_first_name:'Amina',patient_last_name:'Namuli',patient_reference:'P-101',specimen_type:'Blood',collected_at:'2026-10-25T07:15:00Z',container_type:'EDTA tube',container_id:'CT-101',storage_type:'Refrigerated (2–8°C)',image_key:'blood_tube',requested_test:'Full blood count',body_site:'Left arm'},
  {id:sid(2),tracking_code:'RT-UG-1002',active_holder_id:idByKey.courier,patient_first_name:'Moses',patient_last_name:'Okello',patient_reference:'P-102',specimen_type:'Swab',collected_at:'2026-10-26T10:30:00Z',container_type:'Transport vial',container_id:'CT-102',storage_type:'Ambient',image_key:'swab_vial',requested_test:'Culture and sensitivity',collection_method:'Sterile swab',temperature_min_c:18,temperature_max_c:25},
  {id:sid(3),tracking_code:'RT-UG-1003',active_holder_id:idByKey.tech,patient_first_name:'Grace',patient_last_name:'Nambasa',patient_reference:'P-103',specimen_type:'Tissue',collected_at:'2026-10-27T09:00:00Z',container_type:'Specimen jar',container_id:'CT-103',storage_type:'Refrigerated (2–8°C)',image_key:'tissue_jar',requested_test:'Histopathology',clinical_notes:'Simulated biopsy specimen.'},
  {id:sid(4),tracking_code:'RT-UG-1004',active_holder_id:idByKey.tech,patient_first_name:'Peter',patient_last_name:'Mugisha',patient_reference:'P-104',specimen_type:'Urine',collected_at:'2026-10-27T11:30:00Z',container_type:'Sterile collection cup',container_id:'CT-104',storage_type:'Refrigerated (2–8°C)',image_key:'urine_cup',requested_test:'Urinalysis',collection_method:'Clean catch'},
  {id:sid(5),tracking_code:'RT-UG-1005',active_holder_id:idByKey.courier2,patient_first_name:'Linda',patient_last_name:'Atim',patient_reference:'P-105',specimen_type:'Blood',collected_at:'2026-10-28T14:00:00Z',container_type:'Serum tube',container_id:'CT-105',storage_type:'Cool pack',image_key:'blood_tube',requested_test:'Liver function test'},
  {id:sid(6),tracking_code:'RT-UG-1006',active_holder_id:idByKey.tech2,patient_first_name:'John',patient_last_name:'Mwesigwa',patient_reference:'P-106',specimen_type:'Swab',collected_at:'2026-10-28T12:20:00Z',container_type:'Transport vial',container_id:'CT-106',storage_type:'Ambient',image_key:'swab_vial',requested_test:'PCR',collection_method:'Nasopharyngeal swab'}
].map(s=>({...base,...s}));
await upsert('samples',samples);
// Histories show accepted, pending and declined events. Current holders reflect accepted transfers only.
const transfers=[
  {id:tid(1),sample_id:sid(1),sender_id:idByKey.tech,receiver_id:idByKey.courier,requested_at:'2026-10-25T08:00:00Z',responded_at:'2026-10-25T08:06:00Z',accepted:true,declined:false},
  {id:tid(2),sample_id:sid(2),sender_id:idByKey.courier,receiver_id:idByKey.tech,requested_at:'2026-10-29T07:10:00Z',responded_at:null,accepted:false,declined:false},
  {id:tid(3),sample_id:sid(5),sender_id:idByKey.courier2,receiver_id:idByKey.tech,requested_at:'2026-10-28T18:10:00Z',responded_at:'2026-10-28T18:14:00Z',accepted:false,declined:true},
  {id:tid(4),sample_id:sid(6),sender_id:idByKey.courier2,receiver_id:idByKey.tech2,requested_at:'2026-10-28T15:00:00Z',responded_at:'2026-10-28T15:09:00Z',accepted:true,declined:false}
];
await upsert('sample_transfers',transfers);
if(typesenseConfigured()) {
  await ensureCollection();
  for (const sample of samples) await syncSample(sample);
  console.log('Typesense indexed',samples.length,'samples');
} else console.log('Typesense not configured; set its environment variables and run npm run reindex');
console.log('Seeded',samples.length,'synthetic samples and',transfers.length,'transfers.');
console.log('Demo login: courier@reefertrack.demo and technician@reefertrack.demo');
console.log('Join code:',joinCode);
