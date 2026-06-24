import { createClient } from '@/lib/supabase/client';

export type AccessStatus = 'active' | 'expired' | 'revoked';

export type ChallengeAccess = {
  id: string;
  challengeId: string;
  stakeholderUserId: string;
  stakeholderEmail: string | null;   // for matching to the linked contact
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: AccessStatus;
  daysLeft: number;        // 0 when not active
};

function computeStatus(expiresAt: string, revokedAt: string | null): { status: AccessStatus; daysLeft: number } {
  if (revokedAt) return { status: 'revoked', daysLeft: 0 };
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { status: 'expired', daysLeft: 0 };
  return { status: 'active', daysLeft: Math.ceil(ms / (24 * 60 * 60 * 1000)) };
}

// All access rows for a challenge (managers only — RLS enforces).
export async function listChallengeAccess(challengeId: string): Promise<ChallengeAccess[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('challenge_stakeholder_access')
    .select('id, challenge_id, stakeholder_user_id, created_at, expires_at, revoked_at')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  // look up stakeholder emails to bridge to the linked-contact rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = rows.map((r: any) => r.stakeholder_user_id).filter(Boolean);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailById: Record<string, string> = {};
  if (userIds.length) {
    const { data: users, error: uErr } = await supabase
      .from('users').select('id, email').in('id', userIds);
    if (uErr) throw new Error(uErr.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of (users ?? []) as any[]) emailById[u.id] = u.email;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => {
    const { status, daysLeft } = computeStatus(r.expires_at, r.revoked_at);
    return {
      id: r.id,
      challengeId: r.challenge_id,
      stakeholderUserId: r.stakeholder_user_id,
      stakeholderEmail: emailById[r.stakeholder_user_id] ?? null,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at ?? null,
      status,
      daysLeft,
    };
  });
}

export async function revokeAccess(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('challenge_stakeholder_access')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// Calls the server route that reuses-or-creates the stakeholder account
// and inserts a fresh access row. Returns credentials (temp password only
// when the account was newly created).
export async function generateStakeholderAccess(challengeId: string, contactId: string): Promise<{
  loginUrl: string;
  username: string;
  tempPassword: string | null;
  isNewAccount: boolean;
  expiresAt: string;
}> {
  const res = await fetch('/api/stakeholder-access/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, contactId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'generate_failed');
  return {
    loginUrl: data.loginUrl,
    username: data.username,
    tempPassword: data.tempPassword ?? null,
    isNewAccount: !!data.isNewAccount,
    expiresAt: data.expiresAt,
  };
}