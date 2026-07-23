// "My open work" — the feed behind the dashboard to-do pop-up.
//
// A dedicated query rather than a filter bolted onto listTasks/listChallenges:
// both of those carry scope and filter shapes other screens depend on, and
// widening them for one panel is how those signatures rot.
//
// Challenges count as YOURS if you are assigned to one OR raised it — a
// challenge you logged for someone else is still yours to chase, so both belong
// on your list.
import { createClient } from '@/lib/supabase/client';

export type TodoItem = {
  kind: 'task' | 'challenge';
  id: string;
  title: string;
  titleAr: string;
  status: string;
  dueDate: string | null;   // tasks only — challenges carry no due date
  href: string;
};

export type MyOpenWork = {
  tasks: TodoItem[];
  challenges: TodoItem[];
};

// Terminal states. Anything else is still open and belongs on the list.
const CLOSED_TASK_STATUSES = ['done', 'cancelled'];
const CLOSED_CHALLENGE_STATUSES = ['resolved', 'closed'];

export async function listMyOpenWork(): Promise<MyOpenWork> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { tasks: [], challenges: [] };

  const [taskRes, challengeRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, title_ar, status, tat_due_date')
      .eq('assigned_to_id', uid)
      .is('deleted_at', null)
      .not('status', 'in', `(${CLOSED_TASK_STATUSES.join(',')})`),
    supabase
      .from('challenges')
      .select('id, title, title_ar, status')
      .or(`assigned_to_id.eq.${uid},created_by_id.eq.${uid}`)
      .is('deleted_at', null)
      .not('status', 'in', `(${CLOSED_CHALLENGE_STATUSES.join(',')})`),
  ]);

  if (taskRes.error) throw new Error(taskRes.error.message);
  if (challengeRes.error) throw new Error(challengeRes.error.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks: TodoItem[] = (taskRes.data ?? []).map((r: any) => ({
    kind: 'task',
    id: r.id,
    title: r.title ?? '',
    titleAr: r.title_ar ?? '',
    status: r.status,
    dueDate: r.tat_due_date ?? null,
    href: `/tasks/${r.id}`,
  }));

  // Same ordering rule as the Tasks list: nearest due date first, and anything
  // without a due date sinks to the bottom rather than floating to the top.
  tasks.sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const challenges: TodoItem[] = (challengeRes.data ?? []).map((r: any) => ({
    kind: 'challenge',
    id: r.id,
    title: r.title ?? '',
    titleAr: r.title_ar ?? '',
    status: r.status,
    dueDate: null,
    href: `/challenges/${r.id}`,
  }));

  return { tasks, challenges };
}
