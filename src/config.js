import { createClient } from '@supabase/supabase-js';
import Typesense from 'typesense';

const authConfig = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
export const isConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
export function getAdmin() {
  if (!isConfigured()) throw Object.assign(new Error('Supabase environment variables not configured'), { status: 503 });
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, authConfig);
}
export function getAuthClient() {
  if (!isConfigured()) throw Object.assign(new Error('Supabase environment variables not configured'), { status: 503 });
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, authConfig);
}
export const typesenseConfigured = () => Boolean(process.env.TYPESENSE_HOST && process.env.TYPESENSE_ADMIN_API_KEY);
export const COLLECTION = 'reefer_samples';
export function getTypesense() {
  if (!typesenseConfigured()) throw Object.assign(new Error('Typesense not configured'), { status: 503 });
  return new Typesense.Client({
    nodes: [{ host: process.env.TYPESENSE_HOST, port: Number(process.env.TYPESENSE_PORT || 443), protocol: process.env.TYPESENSE_PROTOCOL || 'https' }],
    apiKey: process.env.TYPESENSE_ADMIN_API_KEY,
    connectionTimeoutSeconds: 5,
    numRetries: 1
  });
}
