// SERVICE-ROLE Supabase client. SERVER-ONLY.
//
// This bypasses Row Level Security and can use the Auth admin API (create users,
// generate password links). It must NEVER be imported into client code — the
// service-role key is a full-access secret. Use it only in route handlers that
// have already checked the caller is allowed to perform the operation.
//
// Current use: tenant provisioning (create a new deputyship's first super_admin
// + org + module settings), which inherently needs privileges no logged-in user
// has.
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('provisioning_not_configured'); // env missing
  }
  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
