import { createClient } from '@/lib/supabase/client';
import type {
  Challenge, ChallengeStatus, ChallengeStatusHistoryEntry,
  ChallengeCreateInput, ChallengeFilters, ChallengeType, ChallengePriority,
} from '@/types/challenge';

async function uid(): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('not authenticated');
  return id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapChallenge(r: any): Challenge {
  return {
    id: r.id, title: r.title, titleAr: r.title_ar,
    description: r.description ?? '', descriptionAr: r.description_ar ?? '',
    status: r.status, priority: r.priority, type: r.type,
    domainId: r.domain_id, subDomainId: r.sub_domain_id ?? null,
    assignedToId: r.assigned_to_id ?? null, resolutionNote: r.resolution_note ?? null,
    completionPercentage: r.completion_percentage ?? 0,
    createdById: r.created_by_id, closedById: r.closed_by_id ?? null, closedAt: r.closed_at ?? null,
    archivedAt: r.archived_at ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
    investorId: r.investor_id ?? null,
  };
}

export async function listChallenges(f: ChallengeFilters = {}): Promise<Challenge[]> {
  const supabase = createClient();
  let q = supabase.from('challenges').select('*').is('deleted_at', null).is('archived_at', null)
    .order('created_at', { ascending: false });
  if (f.status) q = q.eq('status', f.status);
  if (f.type) q = q.eq('type', f.type);
  if (f.priority) q = q.eq('priority', f.priority);
  if (f.domainId) q = q.eq('domain_id', f.domainId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapChallenge);
}

export async function getChallenge(id: string): Promise<Challenge | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from('challenges').select('*')
    .eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapChallenge(data) : null;
}

export async function createChallenge(input: ChallengeCreateInput): Promise<string> {
  const supabase = createClient();
  const me = await uid();
  const { data, error } = await supabase.from('challenges').insert({
    title: input.title.trim(),
    title_ar: input.titleAr.trim(),
    description: input.description?.trim() ?? '',
    description_ar: input.descriptionAr?.trim() ?? '',
    type: input.type,
    priority: input.priority ?? 'medium',
    domain_id: input.domainId,
    sub_domain_id: input.subDomainId ?? null,
    created_by_id: me,
    status: 'open',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function updateChallenge(
  id: string,
  patch: Partial<{
    title: string; titleAr: string; description: string; descriptionAr: string;
    type: ChallengeType; priority: ChallengePriority; domainId: string; subDomainId: string | null;
    assignedToId: string | null; completionPercentage: number; resolutionNote: string | null;
  }>,
): Promise<void> {
  const supabase = createClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.titleAr !== undefined) row.title_ar = patch.titleAr.trim();
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.descriptionAr !== undefined) row.description_ar = patch.descriptionAr;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.domainId !== undefined) row.domain_id = patch.domainId;
  if (patch.subDomainId !== undefined) row.sub_domain_id = patch.subDomainId;
  if (patch.assignedToId !== undefined) row.assigned_to_id = patch.assignedToId;
  if (patch.completionPercentage !== undefined) row.completion_percentage = patch.completionPercentage;
  if (patch.resolutionNote !== undefined) row.resolution_note = patch.resolutionNote;
  const { error } = await supabase.from('challenges').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function changeChallengeStatus(id: string, toStatus: ChallengeStatus, reason: string): Promise<void> {
  const supabase = createClient();
  const me = await uid();
  const { data: cur, error: curErr } = await supabase.from('challenges').select('status').eq('id', id).single();
  if (curErr) throw new Error(curErr.message);
  const fromStatus = (cur as { status: ChallengeStatus }).status;
  if (fromStatus === toStatus) return;
  const patch: Record<string, unknown> = { status: toStatus, updated_at: new Date().toISOString() };
  if (toStatus === 'closed') { patch.closed_by_id = me; patch.closed_at = new Date().toISOString(); }
  const { error } = await supabase.from('challenges').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  const { error: hErr } = await supabase.from('challenge_status_history').insert({
    challenge_id: id, from_status: fromStatus, to_status: toStatus, changed_by_id: me, reason: reason || null,
  });
  if (hErr) throw new Error(hErr.message);
}

export async function listChallengeStatusHistory(challengeId: string): Promise<ChallengeStatusHistoryEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('challenge_status_history').select('*')
    .eq('challenge_id', challengeId).order('changed_at', { ascending: false });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((h: any) => ({
    id: h.id, challengeId: h.challenge_id, fromStatus: h.from_status, toStatus: h.to_status,
    changedById: h.changed_by_id, reason: h.reason ?? null, changedAt: h.changed_at,
  }));
}

export async function listChallengeDomains(): Promise<{ id: string; name: string; nameAr: string }[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('domains').select('id, name, name_ar').order('name');
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((d: any) => ({ id: d.id, name: d.name, nameAr: d.name_ar ?? '' }));
}

export async function listChallengeSubDomains(): Promise<{ id: string; domainId: string; name: string; nameAr: string }[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('sub_domains').select('id, domain_id, name, name_ar').order('name');
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((d: any) => ({ id: d.id, domainId: d.domain_id, name: d.name, nameAr: d.name_ar ?? '' }));
}
export async function archiveChallenge(id: string): Promise<void> {
  const supabase = createClient();
  const me = await uid();
  const { error } = await supabase.from('challenges')
    .update({ archived_at: new Date().toISOString(), archived_by_id: me, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}