import { createClient } from '@/lib/supabase/client';

export type StakeholderType = 'external' | 'government' | 'private' | 'other';

export type ChallengeStakeholder = {
  id: string;
  challengeId: string;
  name: string;
  nameAr: string;
  organizationName: string;
  role: string;
  email: string | null;
  type: StakeholderType;
  notes: string;
  createdById: string;
  createdAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToStakeholder(r: any): ChallengeStakeholder {
  return {
    id: r.id,
    challengeId: r.challenge_id,
    name: r.name,
    nameAr: r.name_ar ?? '',
    organizationName: r.organization_name ?? '',
    role: r.role ?? '',
    email: r.email ?? null,
    type: (r.type ?? 'external') as StakeholderType,
    notes: r.notes ?? '',
    createdById: r.created_by_id,
    createdAt: r.created_at,
  };
}

export async function listChallengeStakeholders(challengeId: string): Promise<ChallengeStakeholder[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('challenge_stakeholders').select('*')
    .eq('challenge_id', challengeId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => rowToStakeholder(r));
}

export async function createChallengeStakeholder(input: {
  challengeId: string;
  name: string;
  nameAr?: string;
  organizationName?: string;
  role?: string;
  email?: string | null;
  type?: StakeholderType;
  notes?: string;
}): Promise<ChallengeStakeholder> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new Error('not authenticated');
  const { data, error } = await supabase.from('challenge_stakeholders').insert({
    challenge_id: input.challengeId,
    name: input.name.trim(),
    name_ar: (input.nameAr ?? '').trim(),
    organization_name: (input.organizationName ?? '').trim(),
    role: (input.role ?? '').trim(),
    email: input.email?.trim() || null,
    type: input.type ?? 'external',
    notes: (input.notes ?? '').trim(),
    created_by_id: me,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return rowToStakeholder(data);
}

export async function updateChallengeStakeholder(id: string, patch: Partial<{
  name: string;
  nameAr: string;
  organizationName: string;
  role: string;
  email: string | null;
  type: StakeholderType;
  notes: string;
}>): Promise<void> {
  const supabase = createClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.nameAr !== undefined) row.name_ar = patch.nameAr.trim();
  if (patch.organizationName !== undefined) row.organization_name = patch.organizationName.trim();
  if (patch.role !== undefined) row.role = patch.role.trim();
  if (patch.email !== undefined) row.email = patch.email?.trim() || null;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.notes !== undefined) row.notes = patch.notes.trim();
  const { error } = await supabase.from('challenge_stakeholders').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteChallengeStakeholder(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('challenge_stakeholders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
