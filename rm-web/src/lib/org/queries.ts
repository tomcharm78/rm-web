import { createClient } from '@/lib/supabase/client';

export async function getMyOrgContext(): Promise<{
  departmentName: string | null;
  departmentNameAr: string | null;
  reportsToName: string | null;
  reportsToNameAr: string | null;
  orgName: string;
  orgNameAr: string;
}> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const meId = auth.user?.id;
  if (!meId) throw new Error('not authenticated');

  const { data: me } = await supabase
    .from('users')
    .select('admin_id, organization_id, departments!users_department_id_fkey(name, name_ar)')
    .eq('id', meId)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = me as any;

  let reportsToName: string | null = null;
  let reportsToNameAr: string | null = null;
  if (m?.admin_id) {
    const { data: mgr } = await supabase
      .from('users').select('name, name_ar').eq('id', m.admin_id).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = mgr as any;
    reportsToName = g?.name ?? null;
    reportsToNameAr = g?.name_ar ?? null;
  }

  let orgName = '';
  let orgNameAr = '';
  if (m?.organization_id) {
    const { data: org } = await supabase
      .from('organizations').select('name, name_ar').eq('id', m.organization_id).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = org as any;
    orgName = o?.name ?? '';
    orgNameAr = o?.name_ar ?? '';
  }

  return {
    departmentName: m?.departments?.name ?? null,
    departmentNameAr: m?.departments?.name_ar ?? null,
    reportsToName,
    reportsToNameAr,
    orgName,
    orgNameAr,
  };
}

export async function updateDeputyshipName(name: string, nameAr: string): Promise<void> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const meId = auth.user?.id;
  if (!meId) throw new Error('not authenticated');
  const { data: me } = await supabase
    .from('users').select('organization_id').eq('id', meId).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgId = (me as any)?.organization_id;
  const { error } = await supabase
    .from('organizations')
    .update({ name: name.trim(), name_ar: nameAr.trim(), updated_at: new Date().toISOString() })
    .eq('id', orgId);
  if (error) throw new Error(error.message);
}