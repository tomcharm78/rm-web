// Dashboard route group layout.
//
// This file wraps everything inside the /(dashboard) route group:
//   /(dashboard)/page.tsx              -> "/"
//   /(dashboard)/investors/page.tsx    -> "/investors"
//   /(dashboard)/tasks/page.tsx        -> "/tasks"
//   ...etc.
//
// Auth gating happens here: if there is no logged-in user the layout
// redirects to /login. This is a defense-in-depth check in addition to the
// middleware (which also redirects unauthenticated requests).
//
// The actual UI shell — sidebar, topbar, mobile drawer, language toggle —
// is rendered by <DashboardShell>, a client component (it owns the
// collapsed/expanded sidebar state which has to live in the browser).

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { dbUserToUser } from '@/types';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  // Server-side auth gate — if cookie expired or absent, kick to login.
  if (!authUser) {
    redirect('/login');
  }

  // Fetch the app user row so the shell can display name/role and the
  // sidebar can adjust visible items based on role.
  const { data: appUserRow } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (!appUserRow) {
    // Inconsistent state — auth.users exists but public.users doesn't.
    redirect('/login');
  }

  const appUser = dbUserToUser(appUserRow);

  return <DashboardShell user={appUser}>{children}</DashboardShell>;
}
