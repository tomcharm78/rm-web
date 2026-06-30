import { createClient } from '@/lib/supabase/client';

// short random url-safe token
function makeToken(): string {
  // 24 chars from crypto
  const bytes = new Uint8Array(18);
  (crypto as Crypto).getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 24);
}

export type Distribution = {
  id: string;
  surveyId: string;
  channel: string;          // 'link' | 'email'
  genericToken: string | null;
  label: string;
  createdAt: string;
  tokenCount: number;       // per-investor tokens under this run
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDist(r: any, tokenCount = 0): Distribution {
  return {
    id: r.id,
    surveyId: r.survey_id,
    channel: r.channel,
    genericToken: r.generic_token ?? null,
    label: r.label ?? '',
    createdAt: r.created_at,
    tokenCount,
  };
}

async function orgId(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');
  const { data } = await supabase.from('users').select('organization_id').eq('id', user.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any)?.organization_id;
}

async function currentUserId(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');
  return user.id;
}

export async function listDistributions(surveyId: string): Promise<Distribution[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('survey_distributions').select('*').eq('survey_id', surveyId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const dists = data ?? [];

  // token counts per distribution
  const ids = dists.map((d) => d.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: toks } = await supabase.from('survey_tokens').select('distribution_id').in('distribution_id', ids);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (toks ?? []) as any[]) counts.set(t.distribution_id, (counts.get(t.distribution_id) ?? 0) + 1);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return dists.map((d: any) => rowToDist(d, counts.get(d.id) ?? 0));
}

// create a generic shareable link run (one generic_token, no per-person tokens)
export async function createGenericDistribution(surveyId: string, label: string): Promise<Distribution> {
  const supabase = createClient();
  const org = await orgId();
  const me = await currentUserId();
  const { data, error } = await supabase.from('survey_distributions').insert({
    survey_id: surveyId,
    channel: 'link',
    generic_token: makeToken(),
    label: label.trim(),
    created_by_id: me,
    organization_id: org,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return rowToDist(data);
}

// create a per-investor run: one survey_tokens row per investor (attributed)
export async function createInvestorDistribution(
  surveyId: string, label: string, investorIds: string[],
): Promise<{ distribution: Distribution; tokens: { investorId: string; token: string }[] }> {
  const supabase = createClient();
  const org = await orgId();
  const me = await currentUserId();

  const { data: dist, error: dErr } = await supabase.from('survey_distributions').insert({
    survey_id: surveyId,
    channel: 'email',
    generic_token: null,
    label: label.trim(),
    created_by_id: me,
    organization_id: org,
  }).select('*').single();
  if (dErr) throw new Error(dErr.message);

  const rows = investorIds.map((iid) => ({
    distribution_id: dist.id,
    token: makeToken(),
    investor_id: iid,
    organization_id: org,
  }));
  const { data: inserted, error: tErr } = await supabase.from('survey_tokens').insert(rows).select('token, investor_id');
  if (tErr) throw new Error(tErr.message);

  return {
    distribution: rowToDist(dist, rows.length),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokens: (inserted ?? []).map((t: any) => ({ investorId: t.investor_id, token: t.token })),
  };
}

// list per-investor tokens for a distribution (with investor name+email for the send list)
export async function listInvestorTokens(distributionId: string): Promise<{ token: string; investorId: string | null; name: string; email: string }[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('survey_tokens')
    .select('token, investor_id, investors(company_name, company_name_ar, email)')
    .eq('distribution_id', distributionId);
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((t: any) => ({
    token: t.token,
    investorId: t.investor_id,
    name: [t.investors?.company_name, t.investors?.company_name_ar].filter(Boolean).join(' — '),
    email: t.investors?.email || '',
  }));
}