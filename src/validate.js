export const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUUID = v => typeof v === 'string' && uuidRegex.test(v);
export function bad(message, status = 400) { const error = new Error(message); error.status = status; return error; }
export function requiredString(input, field, max = 200) {
  if (typeof input !== 'string' || !input.trim() || input.trim().length > max) throw bad(`Invalid ${field}`);
  return input.trim();
}
export function optionalString(input, field, max = 1000) {
  if (input == null || input === '') return '';
  if (typeof input !== 'string' || input.trim().length > max) throw bad(`Invalid ${field}`);
  return input.trim();
}
export function samplePayload(b) {
  if (!b || typeof b !== 'object') throw bad('Invalid sample');
  const result = {
    patient_first_name: requiredString(b.patient_first_name, 'patient_first_name'),
    patient_last_name: optionalString(b.patient_last_name, 'patient_last_name'),
    patient_reference: optionalString(b.patient_reference, 'patient_reference'),
    specimen_type: requiredString(b.specimen_type, 'specimen_type'),
    specimen_status: 'available',
    priority: ['routine', 'urgent', 'stat'].includes(b.priority) ? b.priority : 'routine',
    body_site: optionalString(b.body_site, 'body_site'),
    collection_method: optionalString(b.collection_method, 'collection_method'),
    collector_name: optionalString(b.collector_name, 'collector_name'),
    container_type: requiredString(b.container_type, 'container_type'),
    container_id: optionalString(b.container_id, 'container_id'),
    storage_type: requiredString(b.storage_type, 'storage_type'),
    storage_instructions: optionalString(b.storage_instructions, 'storage_instructions'),
    request_reference: optionalString(b.request_reference, 'request_reference'),
    requested_test: optionalString(b.requested_test, 'requested_test'),
    clinical_notes: optionalString(b.clinical_notes, 'clinical_notes', 3000),
    image_key: ['blood_tube','swab_vial','tissue_jar','urine_cup'].includes(b.image_key) ? b.image_key : 'blood_tube'
  };
  const dt = new Date(b.collected_at || Date.now());
  if (Number.isNaN(dt.getTime())) throw bad('Invalid collected_at');
  result.collected_at = dt.toISOString();
  if (b.received_at) {
    const r = new Date(b.received_at);
    if (Number.isNaN(r.getTime())) throw bad('Invalid received_at');
    result.received_at = r.toISOString();
  }
  for (const field of ['temperature_min_c','temperature_max_c','quantity_value']) {
    if (b[field] !== undefined && b[field] !== null && b[field] !== '') {
      const num = Number(b[field]);
      if (!Number.isFinite(num)) throw bad(`Invalid ${field}`);
      result[field] = num;
    }
  }
  result.quantity_unit = optionalString(b.quantity_unit || 'mL', 'quantity_unit', 40);
  if (result.temperature_min_c != null && result.temperature_max_c != null && result.temperature_min_c > result.temperature_max_c) throw bad('Minimum temperature exceeds maximum');
  return result;
}
