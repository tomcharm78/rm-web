import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { dbUserToUser } from '@/types';
import { PortalShell } from '@/components/portal/portal-shell';

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    redirect('/login');
  }
  const { data: appUserRow } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();
  if (!appUserRow) {
    redirect('/login');
  }
  const appUser = dbUserToUser(appUserRow);
  if (appUser.role !== 'stakeholder') {
    redirect('/');
  }
  return <PortalShell user={appUser}>{children}</PortalShell>;
}