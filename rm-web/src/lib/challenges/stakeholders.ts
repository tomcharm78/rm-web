import { createClient } from '@/lib/supabase/client';

export type StakeholderType = 'external' | 'government' | 'private' | 'other';

// A challenge stakeholder is now a LINK to a directory contact, plus a
// per-challenge role. Display reads through the linked contact (falling back
// to the snapshot inline columns kept on the link row).
export type ChallengeStakeholder = {
  id: string;            // link row id
  challengeId: string;
  contactId: string | null;
  linkRole: string;      // role on THIS challenge (challenge_stakeholders.role)
  name: string;
  nameAr: string;
  organization: string;
  email: string | null;
  phone: string;
  type: string;          // contact type (internal_moh|external|government|private|other) or legacy
};

export async function listChallengeStakeholders(challengeId: string): Promise<ChallengeStakeholder[]> {
  const supabase = createClient();
  const { data: links, error } = await supabase.from('challenge_stakeholders').select('*')
    .eq('challenge_id', challengeId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = links ?? [];

  // fetch linked contacts (ignore soft-delete so a detached/archived contact still displays)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactIds = rows.map((r: any) => r.contact_id).filter(Boolean);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId: Record<string, any> = {};
  if (contactIds.length) {
    const { data: cs, error: cErr } = await supabase.from('contacts').select('*').in('id', contactIds);
    if (cErr) throw new Error(cErr.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (cs ?? []) as any[]) byId[c.id] = c;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => {
    const c = r.contact_id ? byId[r.contact_id] : null;
    return {
      id: r.id,
      challengeId: r.challenge_id,
      contactId: r.contact_id ?? null,
      linkRole: r.role ?? '',
      name: c ? c.name : r.name,
      nameAr: c ? (c.name_ar ?? '') : (r.name_ar ?? ''),
      organization: c ? (c.organization ?? '') : (r.organization_name ?? ''),
      email: c ? (c.email ?? null) : (r.email ?? null),
      phone: c ? (c.phone ?? '') : '',
      type: c ? (c.type ?? 'external') : (r.type ?? 'external'),
    };
  });
}

// Attach an existing directory contact to a challenge. Snapshots the contact's
// name/org/email/type into the inline columns (NOT NULL + fallback) and sets contact_id.
export async function linkContactToChallenge(input: {
  challengeId: string;
  contactId: string;
  linkRole?: string;
}): Promise<void> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new Error('not authenticated');

  const { data: c, error: cErr } = await supabase.from('contacts')
    .select('name, name_ar, organization, email, type').eq('id', input.contactId).single();
  if (cErr) throw new Error(cErr.message);

  const inlineType = ['external', 'government', 'private', 'other'].includes((c as { type: string }).type)
    ? (c as { type: string }).type : 'external';

  const { error } = await supabase.from('challenge_stakeholders').insert({
    challenge_id: input.challengeId,
    contact_id: input.contactId,
    role: (input.linkRole ?? '').trim(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    name: (c as any).name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    name_ar: (c as any).name_ar ?? '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    organization_name: (c as any).organization ?? '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    email: (c as any).email ?? null,
    type: inlineType,
    notes: '',
    created_by_id: me,
  });
  if (error) throw new Error(error.message);
}

export async function updateStakeholderLinkRole(id: string, linkRole: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('challenge_stakeholders')
    .update({ role: linkRole.trim(), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

// Unlink (detach) — removes the link row only; the contact stays in the directory.
export async function deleteChallengeStakeholder(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('challenge_stakeholders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
