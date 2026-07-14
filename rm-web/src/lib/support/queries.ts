// TECH SUPPORT queries.
//
// Requests flow from the deputyship's staff UP to the platform owner (the
// can_manage_modules holder). RLS does the scoping: a user sees their own
// requests; the owner sees all and is the only one who can close them.
import { createClient } from '@/lib/supabase/client';

export type SupportStatus = 'open' | 'closed';

export type SupportRequest = {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterRole: string;
  moduleKey: string;
  activity: string;
  problem: string;
  details: string;
  context: Record<string, unknown>;
  attachmentPath: string | null;
  status: SupportStatus;
  response: string | null;
  closedAt: string | null;
  createdAt: string;
};

export type SupportInput = {
  moduleKey: string;
  activity: string;
  problem: string;
  details: string;
  attachmentPath?: string | null;
};

/** Everything about the user's setup that they should not have to describe. */
export function captureContext(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  return {
    page: window.location.pathname + window.location.search,
    language: document.documentElement.lang || navigator.language,
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: navigator.userAgent,
    at: new Date().toISOString(),
  };
}

export async function createSupportRequest(input: SupportInput): Promise<void> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('not_authenticated');

  if (!input.moduleKey || !input.activity || !input.problem) {
    throw new Error('missing_required_fields');
  }

  // Pull the requester's role/department into the context so the owner can see
  // who is affected without a second lookup.
  const { data: me } = await supabase
    .from('users')
    .select('role, department_id, departments!users_department_id_fkey(name)')
    .eq('id', uid)
    .single();

  const context = {
    ...captureContext(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    role: (me as any)?.role ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    department: (me as any)?.departments?.name ?? null,
  };

  const { error } = await supabase.from('support_requests').insert({
    requester_id: uid,
    module_key: input.moduleKey,
    activity: input.activity,
    problem: input.problem,
    details: input.details ?? '',
    attachment_path: input.attachmentPath ?? null,
    context,
  });
  if (error) { console.error('[createSupportRequest]', error); throw new Error(error.message); }
}

/** The owner's inbox (all requests) or a user's own — RLS decides which. */
export async function listSupportRequests(status?: SupportStatus): Promise<SupportRequest[]> {
  const supabase = createClient();
  let q = supabase
    .from('support_requests')
    .select(`
      id, requester_id, module_key, activity, problem, details, context,
      attachment_path, status, response, closed_at, created_at,
      users!support_requests_requester_id_fkey(name, role)
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) { console.error('[listSupportRequests]', error); throw new Error(error.message); }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    requesterId: r.requester_id,
    requesterName: r.users?.name ?? '—',
    requesterRole: r.users?.role ?? '',
    moduleKey: r.module_key,
    activity: r.activity,
    problem: r.problem,
    details: r.details ?? '',
    context: (r.context ?? {}) as Record<string, unknown>,
    attachmentPath: r.attachment_path,
    status: r.status as SupportStatus,
    response: r.response,
    closedAt: r.closed_at,
    createdAt: r.created_at,
  }));
}

/** Close a request with a written reply. Owner only (enforced by RLS). */
export async function closeSupportRequest(id: string, response: string): Promise<void> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('not_authenticated');
  if (!response.trim()) throw new Error('response_required');

  const { error } = await supabase
    .from('support_requests')
    .update({
      status: 'closed',
      response: response.trim(),
      closed_by_id: uid,
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) { console.error('[closeSupportRequest]', error); throw new Error(error.message); }
}

export async function getOpenSupportCount(): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from('support_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
    .is('deleted_at', null);
  if (error) return 0;
  return count ?? 0;
}
