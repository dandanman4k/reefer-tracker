// This is intentionally a standalone pure allowlist so index data cannot
// accidentally inherit confidential sample fields from database rows.
export function searchDocument(row) {
  return {
    id: row.id, tracking_code: row.tracking_code,
    patient_first_name: row.patient_first_name,
    container_type: row.container_type, storage_type: row.storage_type,
    specimen_type: row.specimen_type, organization_id: row.organization_id,
    active_holder_id: row.active_holder_id
  };
}
