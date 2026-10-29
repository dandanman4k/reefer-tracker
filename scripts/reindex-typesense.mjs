import 'dotenv/config';
import { getAdmin } from '../src/config.js';
import { ensureCollection, syncSample } from '../src/typesense.js';
await ensureCollection();
const db = getAdmin();
let start = 0, count = 0;
while (true) {
  const { data, error } = await db.from('samples')
    .select('id,tracking_code,patient_first_name,container_type,storage_type,specimen_type,organization_id,active_holder_id')
    .order('id').range(start,start+499);
  if(error) throw error;
  for (const row of data) { await syncSample(row); count++; }
  if(data.length<500) break;
  start+=500;
}
console.log(`Indexed ${count} samples to Typesense`);
