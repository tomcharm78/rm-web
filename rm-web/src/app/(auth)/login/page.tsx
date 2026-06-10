// Login page — single entrance for all users.
// Three modes:
//   1. bootstrap — first-ever Super Admin setup (when no super_admin exists in DB)
//   2. login — email + password (default)
//   3. forgot — request password reset
//
// Parity contract: see docs/parity/auth.md sections A1.1 - A1.25

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LoginPageClient } from './login-client';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const supabase = await createClient();

  // If already authed, middleware would normally bounce us — but server pages
  // can also redirect here to avoid a flash of the login form during hydration.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect('/');
  }

  // Determine whether bootstrap mode should be shown.
  // We can query users without auth because RLS allows public read of...
  // actually no, RLS DOESN'T allow anon to read users. We need a different
  // approach: a small RPC function, or accept that we'll do an unauth'd
  // count via the `count` head.
  //
  // For pilot simplicity: try a count using anon — if it returns 0 OR errors
  // (due to RLS), we still default to login mode (the common case). Bootstrap
  // mode is only shown when count is explicitly 0 with permission.
  //
  // SIMPLER: expose a tiny RPC that returns just a boolean. Defer the RPC for
  // later; for now, just always show login mode and add a separate route for
  // bootstrap. The bootstrap route does its own check server-side.
  //
  // Decision: ONE login page, but bootstrap is gated by a server check at
  // /login itself — we use an RPC call that's whitelisted in RLS.

  const { data: hasSuperAdminData } = await supabase.rpc('has_super_admin');
  const hasSuperAdmin = hasSuperAdminData === true;

  return <LoginPageClient hasSuperAdmin={hasSuperAdmin} />;
}
