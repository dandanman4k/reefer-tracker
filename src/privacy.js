// Explicit allowlists. Never return raw database rows to the mobile app.
const SAFE = [
  'id', 'tracking_code', 'patient_first_name', 'specimen_type',
  'specimen_status', 'container_type', 'container_id',
  'storage_type', 'storage_instructions', 'temperature_min_c',
  'temperature_max_c', 'image_key', 'active_holder_id', 'collected_at'
];
const TECH_ONLY = [
  'patient_last_name', 'patient_reference', 'priority', 'body_site',
  'collection_method', 'collector_name', 'received_at',
  'quantity_value', 'quantity_unit', 'request_reference', 'requested_test',
  'clinical_notes', 'created_at', 'created_by'
];
export const SAFE_FIELDS = SAFE.join(',');
export const TECH_FIELDS = [...SAFE, ...TECH_ONLY].join(',');
export function serializeSample(row, role) {
  const keys = role === 'technician' ? [...SAFE, ...TECH_ONLY] : SAFE;
  return Object.fromEntries(keys.filter(k => Object.hasOwn(row, k)).map(k => [k, row[k]]));
}
export function serializeProfile(row) {
  return {
    id: row.id, full_name: row.full_name, email: row.email,
    phone: row.phone, role: row.role, organization_id: row.organization_id,
    active: row.active
  };
}
export function publicRecipient(row) {
  return { id: row.id, full_name: row.full_name, role: row.role };
}
export function serializeTransfer(row, names = {}) {
  return {
    id: row.id, sample_id: row.sample_id, sender_id: row.sender_id,
    receiver_id: row.receiver_id, sender_name: names[row.sender_id] || 'Unknown',
    receiver_name: names[row.receiver_id] || 'Unknown',
    requested_at: row.requested_at, responded_at: row.responded_at,
    accepted: row.accepted, declined: row.declined,
    status: row.accepted ? 'accepted' : row.declined ? 'declined' : 'pending'
  };
}
