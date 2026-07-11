// Report data queries. These supply the pieces the existing KPI/dashboard
// queries do NOT already provide:
//   1. Burden/workload — everything in dept-queries is about CLOSED work; the
//      report needs OPEN load (and how it's distributed per person).
//   2. Challenges per department — challenges are domain-based (no
//      department_id), so we derive the department from the ASSIGNEE (whose
//      team is actually carrying the challenge).
// RLS scopes all reads automatically: super/pmo see org-wide, admin sees their
// department, pm sees assigned departments.
import { createClient } from '@/lib/supabase/client';

// Tasks that are still live work: not finished, not cancelled.
const OPEN_TASK_STATUSES = ['pending', 'in_progress', 'blocked'];
// Challenges still being worked: not resolved, not closed.
const ACTIVE_CHALLENGE_STATUSES = ['open', 'investigating', 'mitigation_in_progress'];

export type DepartmentBurden = {
  departmentId: string;
  departmentName: string;
  departmentNameAr: string;
  openTasks: number;
  overdueTasks: number;
  memberCount: number;
  openPerMember: number; // the burden number — is this department overloaded?
};

export type ReportChallenge = {
  id: string;
  title: string;
  titleAr: string;
  status: string;
  priority: string;
  completionPercentage: number;
  departmentId: string | null;
  departmentName: string;
  departmentNameAr: string;
};

/**
 * Open-work burden per department. `deptId` null = all departments the caller
 * can see (RLS decides); otherwise a single department.
 */
export async function getDepartmentBurden(deptId: string | null = null): Promise<DepartmentBurden[]> {
  const supabase = createClient();
  const nowIso = new Date().toISOString();

  // Departments in scope.
  let deptQ = supabase.from('departments').select('id, name, name_ar').is('deleted_at', null).eq('is_active', true);
  if (deptId) deptQ = deptQ.eq('id', deptId);
  const { data: depts, error: deptErr } = await deptQ.order('name');
  if (deptErr) { console.error('[getDepartmentBurden] departments:', deptErr); throw new Error(deptErr.message); }

  // Open tasks in scope (one read, grouped in memory — avoids N queries).
  let taskQ = supabase
    .from('tasks')
    .select('id, department_id, tat_due_date, status')
    .in('status', OPEN_TASK_STATUSES)
    .is('deleted_at', null);
  if (deptId) taskQ = taskQ.eq('department_id', deptId);
  const { data: tasks, error: taskErr } = await taskQ;
  if (taskErr) { console.error('[getDepartmentBurden] tasks:', taskErr); throw new Error(taskErr.message); }

  // Active members per department.
  let memberQ = supabase
    .from('users')
    .select('id, department_id')
    .eq('is_active', true)
    .is('deleted_at', null);
  if (deptId) memberQ = memberQ.eq('department_id', deptId);
  const { data: members, error: memErr } = await memberQ;
  if (memErr) { console.error('[getDepartmentBurden] members:', memErr); throw new Error(memErr.message); }

  return (depts ?? []).map((d) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deptTasks = (tasks ?? []).filter((t: any) => t.department_id === d.id);
    const openTasks = deptTasks.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overdueTasks = deptTasks.filter((t: any) => t.tat_due_date && t.tat_due_date < nowIso).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memberCount = (members ?? []).filter((m: any) => m.department_id === d.id).length;
    const openPerMember = memberCount > 0 ? Math.round((openTasks / memberCount) * 10) / 10 : 0;
    return {
      departmentId: d.id as string,
      departmentName: (d.name as string) ?? '',
      departmentNameAr: (d.name_ar as string) ?? '',
      openTasks,
      overdueTasks,
      memberCount,
      openPerMember,
    };
  });
}

/**
 * Active challenges, named, with progress %. Department is derived from the
 * ASSIGNEE's department (challenges have no department_id of their own).
 * `deptId` null = all departments the caller can see.
 */
export async function getDepartmentChallenges(deptId: string | null = null): Promise<ReportChallenge[]> {
  const supabase = createClient();

  const { data: challenges, error } = await supabase
    .from('challenges')
    .select('id, title, title_ar, status, priority, completion_percentage, assigned_to_id')
    .in('status', ACTIVE_CHALLENGE_STATUSES)
    .is('deleted_at', null)
    .order('completion_percentage', { ascending: true }); // least progress first — the ones needing attention
  if (error) { console.error('[getDepartmentChallenges] challenges:', error); throw new Error(error.message); }
  if (!challenges || challenges.length === 0) return [];

  // Resolve each assignee's department (challenges are domain-based).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assigneeIds = Array.from(new Set((challenges as any[]).map((c) => c.assigned_to_id).filter(Boolean)));
  const deptByUser = new Map<string, { id: string; name: string; nameAr: string }>();
  if (assigneeIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, department_id, departments!users_department_id_fkey(id, name, name_ar)')
      .in('id', assigneeIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of (users ?? []) as any[]) {
      if (u.departments) {
        deptByUser.set(u.id, {
          id: u.departments.id,
          name: u.departments.name ?? '',
          nameAr: u.departments.name_ar ?? '',
        });
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: ReportChallenge[] = (challenges as any[]).map((c) => {
    const dept = c.assigned_to_id ? deptByUser.get(c.assigned_to_id) : undefined;
    return {
      id: c.id as string,
      title: (c.title as string) ?? '',
      titleAr: (c.title_ar as string) ?? '',
      status: (c.status as string) ?? '',
      priority: (c.priority as string) ?? '',
      completionPercentage: (c.completion_percentage as number) ?? 0,
      departmentId: dept?.id ?? null,
      departmentName: dept?.name ?? '',
      departmentNameAr: dept?.nameAr ?? '',
    };
  });

  return deptId ? rows.filter((r) => r.departmentId === deptId) : rows;
}
