// Force password change interception page.
// Middleware redirects here when public.users.force_password_change = true.
// User must set a new password before they can reach any other route.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ForcePasswordChangeClient } from './client';

export const dynamic = 'force-dynamic';

export default async function ForcePasswordChangePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <ForcePasswordChangeClient />;
}
