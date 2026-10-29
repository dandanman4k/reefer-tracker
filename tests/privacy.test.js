import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeSample } from '../src/privacy.js';
import { searchDocument } from '../src/search_document.js';
import { samplePayload } from '../src/validate.js';
const sample = {
  id:'id1', tracking_code:'REF-123', patient_first_name:'Ada', patient_last_name:'Example',
  patient_reference:'SECRET-987', clinical_notes:'Private medical information',
  requested_test:'HIV', storage_type:'Chilled', container_type:'Tube', specimen_type:'Blood',
  organization_id:'org', active_holder_id:'u1', collected_at:'2026-10-29T01:00:00Z'
};
test('courier sample payload is an explicit allowlist', () => {
  const r = serializeSample(sample, 'courier');
  assert.equal(r.patient_first_name, 'Ada');
  for (const key of ['patient_last_name','patient_reference','clinical_notes','requested_test','organization_id']) assert.equal(r[key], undefined);
});
test('technician can see clinical fields', () => assert.equal(serializeSample(sample, 'technician').clinical_notes,'Private medical information'));
test('Typesense index excludes patient identity and clinical notes', () => {
  const d = searchDocument(sample);
  for (const key of ['patient_last_name','patient_reference','clinical_notes','requested_test']) assert.equal(d[key], undefined);
});
test('sample creation validates temperature range', () => assert.throws(() => samplePayload({ patient_first_name:'Ada', specimen_type:'Blood', container_type:'Tube', storage_type:'Chilled', temperature_min_c:9, temperature_max_c:2 }), /Minimum/));
