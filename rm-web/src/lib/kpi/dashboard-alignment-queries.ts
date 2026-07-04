import { createClient } from '@/lib/supabase/client';
import { currentQuarter, quarterBounds } from '@/types/kpi';
import {
  getGoalProgress, getDepartmentAlignment,
  type GoalProgress, type DeptAlignment,
} from '@/lib/kpi/alignment-queries';

// ---------- shared band helper (0-25 red / 25-50 amber / 50-75 light-green / 75-100 green) ----------
export type Band = 'low' | 'mid' | 'good' | 'high';
export function alignmentBand(pct: number): Band {
  if (pct < 25) return 'low';
  if (pct < 50) return 'mid';
  if (pct < 75) return 'good';
  return 'high';
}
export const BAND_COLOR: Record<Band, string> = {
  low: '#e34948',
  mid: '#eda100',
  good: '#63991a',
  high: '#199e70',
};

// ---------- 1. all-departments alignment index (super) ----------
export async function getOverallAlignment(year: number): Promise<{ alignmentPct: number; alignedCompleted: number; totalCompleted: number }> {
  const rows = await getDepartmentAlignment(year, null);
  const alignedCompleted = rows.reduce((s, r) => s + r.alignedCompleted, 0);
  const totalCompleted = rows.reduce((s, r) => s + r.totalCompleted, 0);
  return {
    alignedCompleted,
    totalCompleted,
    alignmentPct: totalCompleted > 0 ? Math.round((alignedCompleted / totalCompleted) * 100) : 0,
  };
}

// ---------- 2. per-department alignment index (super), with names ----------
export type DeptAlignmentNamed = DeptAlignment & { departmentName: string; departmentNameAr: string };
export async function getPerDepartmentAlignment(year: number): Promise<DeptAlignmentNamed[]> {
  const supabase = createClient();
  const rows = await getDepartmentAlignment(year, null);
  const { data: depts } = await supabase.from('departments').select('id, name, name_ar');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nameMap = new Map<string, { name: string; nameAr: string }>((((depts ?? []) as any[])).map((d) => [d.id, { name: d.name, nameAr: d.name_ar ?? '' }]));
  return rows.map((r) => ({
    ...r,
    departmentName: nameMap.get(r.departmentId)?.name ?? '—',
    departmentNameAr: nameMap.get(r.departmentId)?.nameAr ?? '',
  })).sort((a, b) => b.alignmentPct - a.alignmentPct);
}

// ---------- 3. deputyship per-goal index (super) — PLAIN AVERAGE of child exec goals ----------
export type DeputyshipGoalIndex = {
  deputyshipGoalId: string;
  title: string;
  titleAr: string;
  childCount: number;
  indexPct: number;
};
export async function getDeputyshipGoalIndex(year: number): Promise<DeputyshipGoalIndex[]> {
  const supabase = createClient();
  const goals: GoalProgress[] = await getGoalProgress(year, null);
  if (!goals.length) return [];
  const byParent = new Map<string, number[]>();
  for (const g of goals) {
    const pct = g.target > 0 ? Math.min(100, Math.round((g.achieved / g.target) * 100)) : 0;
    const arr = byParent.get(g.deputyshipGoalId) ?? [];
    arr.push(pct);
    byParent.set(g.deputyshipGoalId, arr);
  }
  const parentIds = Array.from(byParent.keys());
  const { data: sg } = await supabase.from('strategic_goals').select('id, title, title_ar').in('id', parentIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const titleMap = new Map<string, { title: string; titleAr: string }>((((sg ?? []) as any[])).map((s) => [s.id, { title: s.title, titleAr: s.title_ar ?? '' }]));
  return parentIds.map((pid) => {
    const pcts = byParent.get(pid) ?? [];
    const indexPct = pcts.length ? Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length) : 0;
    return {
      deputyshipGoalId: pid,
      title: titleMap.get(pid)?.title ?? '—',
      titleAr: titleMap.get(pid)?.titleAr ?? '',
      childCount: pcts.length,
      indexPct,
    };
  }).sort((a, b) => b.indexPct - a.indexPct);
}

// ---------- 4. single-department alignment index (admin) ----------
export async function getSingleDepartmentAlignment(year: number, deptId: string): Promise<{ alignmentPct: number; alignedCompleted: number; totalCompleted: number }> {
  const rows = await getDepartmentAlignment(year, deptId);
  const row = rows.find((r) => r.departmentId === deptId);
  return {
    alignedCompleted: row?.alignedCompleted ?? 0,
    totalCompleted: row?.totalCompleted ?? 0,
    alignmentPct: row?.alignmentPct ?? 0,
  };
}

// ---------- 5. per-employee alignment (admin) ----------
export type EmployeeAlignment = {
  userId: string;
  name: string;
  alignedCompleted: number;
  totalCompleted: number;
  alignmentPct: number;
};
export async function getEmployeeAlignment(year: number, deptId: string): Promise<EmployeeAlignment[]> {
  const supabase = createClient();
  const q = currentQuarter();
  const { start, end } = quarterBounds(year, q);

  const { data: tasks } = await supabase.from('tasks')
    .select('id, assigned_to_id').eq('department_id', deptId).is('deleted_at', null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskRows = (tasks ?? []) as any[];
  const taskAssignee = new Map<string, string | null>(taskRows.map((t) => [t.id, t.assigned_to_id ?? null]));
  const taskIds = taskRows.map((t) => t.id);
  if (!taskIds.length) return [];

  const completed = new Set<string>();
  const { data: hist } = await supabase.from('task_status_history')
    .select('task_id, changed_at').in('task_id', taskIds)
    .eq('to_status', 'done').gte('changed_at', start).lt('changed_at', end);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const h of (hist ?? []) as any[]) completed.add(h.task_id);
  if (!completed.size) return [];

  const { data: links } = await supabase.from('task_goals')
    .select('task_id').in('task_id', Array.from(completed));
  const linked = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (links ?? []) as any[]) linked.add(l.task_id);

  const agg = new Map<string, { aligned: number; total: number }>();
  for (const tid of completed) {
    const uid = taskAssignee.get(tid);
    if (!uid) continue;
    const cur = agg.get(uid) ?? { aligned: 0, total: 0 };
    cur.total += 1;
    if (linked.has(tid)) cur.aligned += 1;
    agg.set(uid, cur);
  }
  const userIds = Array.from(agg.keys());
  if (!userIds.length) return [];

  const { data: users } = await supabase.from('users').select('id, name').in('id', userIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nameMap = new Map<string, string>((((users ?? []) as any[])).map((u) => [u.id, u.name]));

  return userIds.map((uid) => {
    const v = agg.get(uid)!;
    return {
      userId: uid,
      name: nameMap.get(uid) ?? '—',
      alignedCompleted: v.aligned,
      totalCompleted: v.total,
      alignmentPct: v.total > 0 ? Math.round((v.aligned / v.total) * 100) : 0,
    };
  }).sort((a, b) => b.alignmentPct - a.alignmentPct);
}
