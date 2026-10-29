import { COLLECTION, getTypesense, typesenseConfigured } from './config.js';
import { searchDocument } from './search_document.js';
export const collectionSchema = {
  name: COLLECTION,
  fields: [
    { name:'tracking_code', type:'string' },
    { name:'patient_first_name', type:'string' },
    { name:'container_type', type:'string' },
    { name:'storage_type', type:'string' },
    { name:'specimen_type', type:'string' },
    { name:'organization_id', type:'string', facet:true },
    { name:'active_holder_id', type:'string', facet:true },
  ]
};
export async function ensureCollection() {
  const client = getTypesense();
  try { await client.collections(COLLECTION).retrieve(); }
  catch (e) { if (e.httpStatus !== 404) throw e; await client.collections().create(collectionSchema); }
}
export async function syncSample(row) {
  if (!typesenseConfigured()) return false;
  await getTypesense().collections(COLLECTION).documents().upsert(searchDocument(row));
  return true;
}
export async function searchIds(q, profile, perPage = 40) {
  const search = await getTypesense().collections(COLLECTION).documents().search({
    q, query_by: 'tracking_code,patient_first_name,container_type,storage_type,specimen_type',
    filter_by: `organization_id:=${profile.organization_id} && active_holder_id:=${profile.id}`,
    per_page: perPage, include_fields: 'id'
  });
  return (search.hits || []).map(h => h.document.id);
}
