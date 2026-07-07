import { createClient } from '@/lib/supabase/client';
import ExcelJS from 'exceljs';

// ============================================================================
// KPI GANTT EXPORT — Stage 1: the tree-builder query (data only, no Excel yet)
// Assembles: deputyship goal -> department (executive) goal -> linked tasks
//            -> milestones -> subtasks. Role-scoped. Carries dates + status
//            so the ExcelJS writer (Stage 2) can draw month bars colored by pace.
// ============================================================================

export type GanttStatus = 'on_track' | 'deviated' | 'behind' | 'done' | 'not_done' | 'none';

// month index helpers: a bar spans monthStart..monthEnd (1..12), null = no placement
export type GanttNode = {
  level: 1 | 2 | 3 | 4 | 5;      // 1=deputyship 2=dept-goal 3=task 4=milestone 5=subtask
  id: string;
  title: string;
  titleAr: string;
  status: GanttStatus;
  monthStart: number | null;      // 1..12 (Jan..Dec), inclusive
  monthEnd: number | null;        // 1..12, inclusive
  pct: number | null;             // completion %, where meaningful (tasks/goals)
  meta?: string;                  // small annotation (dept name, target, etc.)
};

export type GanttTree = {
  year: number;
  quarters: number[];             // selected quarters, e.g. [1,2,3,4]
  scopeLabel: string;             // 'All departments' or a department name
  nodes: GanttNode[];             // flat, pre-ordered, each carries its level for row grouping
};

// ---- date -> month(1..12) within the given year; null if outside year ----
function monthInYear(iso: string | null, year: number): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() !== year) {
    // clamp: before the year -> Jan, after the year -> Dec, so long-running items still show
    if (d.getFullYear() < year) return 1;
    return 12;
  }
  return d.getMonth() + 1;
}

// quarter (1..4) -> its three month numbers
function quarterMonths(q: number): number[] {
  const start = (q - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

// which months are covered by the selected quarters
function selectedMonths(quarters: number[]): Set<number> {
  const s = new Set<number>();
  for (const q of quarters) for (const m of quarterMonths(q)) s.add(m);
  return s;
}

// pace for a target-carrying goal: achieved vs the cumulative target of elapsed quarters
function goalPace(achieved: number, target: number): GanttStatus {
  if (target <= 0) return 'none';
  const ratio = achieved / target;
  if (ratio >= 1) return 'done';
  if (ratio >= 0.75) return 'on_track';
  if (ratio >= 0.4) return 'deviated';
  return 'behind';
}

// pace for a task by completion %
function taskPace(pct: number): GanttStatus {
  if (pct >= 100) return 'done';
  if (pct >= 75) return 'on_track';
  if (pct >= 40) return 'deviated';
  return 'behind';
}

// cumulative target across the selected quarters
function cumulativeTarget(g: { q1_target: number; q2_target: number; q3_target: number; q4_target: number }, quarters: number[]): number {
  let t = 0;
  if (quarters.includes(1)) t += Number(g.q1_target ?? 0);
  if (quarters.includes(2)) t += Number(g.q2_target ?? 0);
  if (quarters.includes(3)) t += Number(g.q3_target ?? 0);
  if (quarters.includes(4)) t += Number(g.q4_target ?? 0);
  return t;
}

// the month-span for a goal = first..last month of its selected quarters
function goalSpan(quarters: number[]): { start: number; end: number } {
  const months = quarters.flatMap(quarterMonths).sort((a, b) => a - b);
  return { start: months[0], end: months[months.length - 1] };
}

// ============================================================================
// MAIN: build the tree. scopeDeptId null = super (all depts); else admin's dept.
// ============================================================================
export async function buildGanttTree(
  year: number,
  quarters: number[],
  scopeDeptId: string | null,
  scopeLabel: string,
): Promise<GanttTree> {
  const supabase = createClient();
  const monthSet = selectedMonths(quarters);
  const nodes: GanttNode[] = [];

  // 1. deputyship goals (strategic_goals tier='deputyship') for this year
  const { data: depGoals } = await supabase
    .from('strategic_goals')
    .select('id, title, title_ar, q1_target, q2_target, q3_target, q4_target')
    .eq('tier', 'deputyship').eq('status', 'active');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deputyshipGoals = (depGoals ?? []) as any[];

  // 2. department (executive) goals in scope for this year
  let dgq = supabase
    .from('department_goals')
    .select('id, title, title_ar, department_id, deputyship_goal_id, q1_target, q2_target, q3_target, q4_target, target_type, current_value')
    .eq('status', 'active').eq('year', year);
  if (scopeDeptId) dgq = dgq.eq('department_id', scopeDeptId);
  const { data: dGoals } = await dgq;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deptGoals = (dGoals ?? []) as any[];
  const deptGoalIds = deptGoals.map((g) => g.id);

  // 3. department names (for meta labels when super sees all)
  const { data: depts } = await supabase.from('departments').select('id, name, name_ar');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deptName = new Map<string, string>(((depts ?? []) as any[]).map((d) => [d.id, d.name]));

  // 4. task links -> which tasks serve each dept goal
  const { data: tLinks } = await supabase.from('task_goals').select('task_id, department_goal_id').in('department_goal_id', deptGoalIds.length ? deptGoalIds : ['x']);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskLinks = (tLinks ?? []) as any[];
  const tasksByGoal = new Map<string, string[]>();
  for (const l of taskLinks) {
    const arr = tasksByGoal.get(l.department_goal_id) ?? [];
    arr.push(l.task_id); tasksByGoal.set(l.department_goal_id, arr);
  }
  const allTaskIds = Array.from(new Set(taskLinks.map((l) => l.task_id)));

  // 5. the tasks themselves (dates, completion)
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, title_ar, tat_start_at, tat_due_date, completion_percentage')
    .in('id', allTaskIds.length ? allTaskIds : ['x']).is('deleted_at', null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskById = new Map<string, any>(((tasks ?? []) as any[]).map((t) => [t.id, t]));

  // 6. milestones for those tasks
  const { data: ms } = await supabase
    .from('task_milestones')
    .select('id, task_id, title, title_ar, due_date, is_done')
    .in('task_id', allTaskIds.length ? allTaskIds : ['x']);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const milestones = (ms ?? []) as any[];
  const msByTask = new Map<string, any[]>();
  for (const m of milestones) {
    const arr = msByTask.get(m.task_id) ?? [];
    arr.push(m); msByTask.set(m.task_id, arr);
  }
  const allMsIds = milestones.map((m) => m.id);

  // 7. subtasks for those milestones
  const { data: subs } = await supabase
    .from('milestone_subtasks')
    .select('id, milestone_id, title, title_ar, due_date, is_done')
    .in('milestone_id', allMsIds.length ? allMsIds : ['x']);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtasks = (subs ?? []) as any[];
  const subByMs = new Map<string, any[]>();
  for (const s of subtasks) {
    const arr = subByMs.get(s.milestone_id) ?? [];
    arr.push(s); subByMs.set(s.milestone_id, arr);
  }

  // group dept goals under their deputyship parent
  const deptGoalsByParent = new Map<string, any[]>();
  for (const g of deptGoals) {
    const arr = deptGoalsByParent.get(g.deputyship_goal_id) ?? [];
    arr.push(g); deptGoalsByParent.set(g.deputyship_goal_id, arr);
  }

  const span = goalSpan(quarters);

  // ---- walk the tree, emitting flat pre-ordered nodes with levels ----
  for (const dep of deputyshipGoals) {
    const children = deptGoalsByParent.get(dep.id) ?? [];
    if (children.length === 0) continue; // skip deputyship goals with no dept goals in scope

    // level 1: deputyship goal — bar spans the selected quarters
    nodes.push({
      level: 1, id: dep.id, title: dep.title, titleAr: dep.title_ar ?? '',
      status: 'none', monthStart: span.start, monthEnd: span.end, pct: null,
    });

    for (const g of children) {
      // level 2: department (executive) goal — pace from achieved vs cumulative target
      const target = cumulativeTarget(g, quarters);
      const achieved = Number(g.current_value ?? 0);
      nodes.push({
        level: 2, id: g.id, title: g.title, titleAr: g.title_ar ?? '',
        status: goalPace(achieved, target),
        monthStart: span.start, monthEnd: span.end,
        pct: target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : null,
        meta: scopeDeptId ? undefined : (deptName.get(g.department_id) ?? ''),
      });

      // level 3: linked tasks
      const taskIds = tasksByGoal.get(g.id) ?? [];
      for (const tid of taskIds) {
        const t = taskById.get(tid);
        if (!t) continue;
        const startM = monthInYear(t.tat_start_at, year);
        const dueM = monthInYear(t.tat_due_date, year);
        // skip tasks whose whole span falls outside the selected quarters
        const tStart = startM ?? dueM;
        const tEnd = dueM ?? startM;
        if (tStart && tEnd && !rangeTouchesMonths(tStart, tEnd, monthSet)) continue;
        const pct = Number(t.completion_percentage ?? 0);
        nodes.push({
          level: 3, id: t.id, title: t.title, titleAr: t.title_ar ?? '',
          status: taskPace(pct),
          monthStart: tStart, monthEnd: tEnd, pct,
        });

        // level 4: milestones (green=done / grey=not), placed on due-date month
        const mils = msByTask.get(tid) ?? [];
        for (const m of mils) {
          const mM = monthInYear(m.due_date, year);
          nodes.push({
            level: 4, id: m.id, title: m.title, titleAr: m.title_ar ?? '',
            status: m.is_done ? 'done' : 'not_done',
            monthStart: mM, monthEnd: mM, pct: null,
          });

          // level 5: subtasks (green=done / grey=not), on due-date month
          const ss = subByMs.get(m.id) ?? [];
          for (const s of ss) {
            const sM = monthInYear(s.due_date, year);
            nodes.push({
              level: 5, id: s.id, title: s.title, titleAr: s.title_ar ?? '',
              status: s.is_done ? 'done' : 'not_done',
              monthStart: sM, monthEnd: sM, pct: null,
            });
          }
        }
      }
    }
  }

  return { year, quarters: quarters.slice().sort((a, b) => a - b), scopeLabel, nodes };
}

// does the inclusive month range [a..b] intersect the selected-month set?
function rangeTouchesMonths(a: number, b: number, monthSet: Set<number>): boolean {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  for (let m = lo; m <= hi; m++) if (monthSet.has(m)) return true;
  return false;
}

// ============================================================================
// KPI GANTT EXPORT — Stage 2: the ExcelJS writer (browser-side)
// Takes the GanttTree and produces a downloadable .xlsx:
//  - month columns across the selected quarters
//  - 5-level native Excel row grouping (+/- outline)
//  - status-colored cell bars
//  - bilingual labeled header
// ============================================================================


const STATUS_FILL: Record<GanttStatus, string> = {
  on_track: 'FF63991A', // light green
  done: 'FF199E70',     // green
  deviated: 'FFEDA100', // amber
  behind: 'FFE34948',   // red
  not_done: 'FFBFBFBF', // grey
  none: 'FF2A78D6',     // blue (deputyship span, neutral)
};

const MONTH_ABBR_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_ABBR_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const LEVEL_LABEL_EN: Record<number, string> = { 1: 'Deputyship goal', 2: 'Department goal', 3: 'Task', 4: 'Milestone', 5: 'Sub-task' };
const LEVEL_LABEL_AR: Record<number, string> = { 1: 'هدف الوكالة', 2: 'هدف الإدارة', 3: 'مهمة', 4: 'مرحلة', 5: 'مهمة فرعية' };

// download a workbook buffer as a file in the browser
async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportGanttExcel(tree: GanttTree, ar: boolean): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RM Platform';
  wb.created = new Date();
  const ws = wb.addWorksheet(ar ? 'مخطط جانت' : 'Gantt', {
    views: [{ rightToLeft: ar, state: 'frozen', xSplit: 2, ySplit: 5 }],
  });

  // the months to render, in order, from the selected quarters
  const months: number[] = [];
  for (const q of tree.quarters) {
    const start = (q - 1) * 3 + 1;
    months.push(start, start + 1, start + 2);
  }
  const monthAbbr = ar ? MONTH_ABBR_AR : MONTH_ABBR_EN;

  // ---- column layout: [Level] [Title] [month1] [month2] ... ----
  const firstMonthCol = 3; // columns 1,2 are Level + Title
  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 44;
  months.forEach((_, i) => { ws.getColumn(firstMonthCol + i).width = 6; });

  // ---- header block (rows 1-4) ----
  const totalCols = 2 + months.length;
  const lastColLetter = ws.getColumn(totalCols).letter;

  ws.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = ar ? 'مخطط جانت لمؤشرات الأداء — تصدير Excel' : 'KPI Gantt — Excel export';
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: ar ? 'right' : 'left' };

  ws.mergeCells(`A2:${lastColLetter}2`);
  const qLabel = tree.quarters.map((q) => 'Q' + q).join(', ');
  ws.getCell('A2').value = ar
    ? `السنة: ${tree.year}  ·  الأرباع: ${qLabel}  ·  النطاق: ${tree.scopeLabel}`
    : `Year: ${tree.year}  ·  Quarters: ${qLabel}  ·  Scope: ${tree.scopeLabel}`;
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF666666' } };
  ws.getCell('A2').alignment = { horizontal: ar ? 'right' : 'left' };

  ws.mergeCells(`A3:${lastColLetter}3`);
  ws.getCell('A3').value = (ar ? 'تاريخ الإنشاء: ' : 'Generated: ') + new Date().toLocaleString(ar ? 'ar' : 'en-GB');
  ws.getCell('A3').font = { size: 9, color: { argb: 'FF999999' } };
  ws.getCell('A3').alignment = { horizontal: ar ? 'right' : 'left' };

  // ---- column header row (row 5): Level | Title | month names (grouped by quarter tint) ----
  const headerRow = ws.getRow(5);
  headerRow.getCell(1).value = ar ? 'المستوى' : 'Level';
  headerRow.getCell(2).value = ar ? 'العنوان' : 'Title';
  months.forEach((m, i) => {
    const c = headerRow.getCell(firstMonthCol + i);
    c.value = monthAbbr[m - 1];
    c.alignment = { horizontal: 'center' };
  });
  headerRow.eachCell((c) => {
    c.font = { bold: true, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    c.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });

  // ---- data rows ----
  let rowIdx = 6;
  for (const node of tree.nodes) {
    const row = ws.getRow(rowIdx);
    const indent = '  '.repeat(node.level - 1);

    row.getCell(1).value = ar ? LEVEL_LABEL_AR[node.level] : LEVEL_LABEL_EN[node.level];
    row.getCell(1).font = { size: 9, color: { argb: 'FF999999' } };

    const label = (ar ? node.titleAr || node.title : node.title) + (node.meta ? `  ·  ${node.meta}` : '') + (node.pct != null ? `  (${node.pct}%)` : '');
    const titleCellData = row.getCell(2);
    titleCellData.value = indent + label;
    titleCellData.font = { size: 10, bold: node.level <= 2 };
    titleCellData.alignment = { horizontal: ar ? 'right' : 'left', wrapText: false };

    // native Excel row grouping: outlineLevel drives the +/- collapse
    row.outlineLevel = node.level - 1;

    // draw the status bar across the node's month span
    if (node.monthStart != null && node.monthEnd != null) {
      const lo = Math.min(node.monthStart, node.monthEnd);
      const hi = Math.max(node.monthStart, node.monthEnd);
      months.forEach((m, i) => {
        if (m >= lo && m <= hi) {
          const c = row.getCell(firstMonthCol + i);
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[node.status] } };
        }
      });
    }
    rowIdx++;
  }

  // collapse deeper levels by default so the sheet opens tidy (user expands with +)
  ws.properties.outlineLevelRow = 4;

  const fname = `kpi-gantt-${tree.year}-${tree.quarters.map((q) => 'Q' + q).join('')}.xlsx`;
  await downloadWorkbook(wb, fname);
}
