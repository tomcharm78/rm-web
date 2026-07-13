// Excel export for the Reports module.
//
// Excel gets the NUMBERS, not the visuals — that's what a spreadsheet is for.
// One sheet per report section. Charts stay in the PDF/PPTX outputs.
// Sheets are RTL when the report language is Arabic.
import ExcelJS from 'exceljs';
import type { ReportData } from '@/components/reports/dept-alignment-report';
import type { WeeklyData } from '@/components/reports/weekly-report';

const GREEN = 'FF199E70';
const HEADER_FILL = 'FFF0F7F4';

function styleSheet(ws: ExcelJS.Worksheet, ar: boolean) {
  ws.views = [{ rightToLeft: ar }];
}

/** Title rows at the top of a sheet, then the table's header row. */
function addTable(
  ws: ExcelJS.Worksheet,
  title: string,
  head: string[],
  rows: (string | number)[][],
) {
  const t = ws.addRow([title]);
  t.font = { bold: true, size: 13, color: { argb: GREEN } };
  ws.addRow([]);

  const hr = ws.addRow(head);
  hr.font = { bold: true };
  hr.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' },
    };
  });

  for (const r of rows) {
    const row = ws.addRow(r);
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'hair' }, left: { style: 'hair' },
        bottom: { style: 'hair' }, right: { style: 'hair' },
      };
    });
  }

  // Auto-ish column widths.
  head.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    const longest = Math.max(
      String(h).length,
      ...rows.map((r) => String(r[i] ?? '').length),
    );
    col.width = Math.min(Math.max(longest + 4, 12), 50);
  });

  ws.addRow([]);
  ws.addRow([]);
}

function download(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------- Report 1
export async function exportAlignmentExcel(data: ReportData, ar: boolean): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const totalOpen = data.burden.reduce((s, b) => s + b.openTasks, 0);
  const totalOverdue = data.burden.reduce((s, b) => s + b.overdueTasks, 0);

  // Summary
  const s1 = wb.addWorksheet(ar ? 'الملخص' : 'Summary');
  styleSheet(s1, ar);
  addTable(
    s1,
    ar ? 'تقرير محاذاة الإدارات والنشاط' : 'Department Alignment & Activity Report',
    [ar ? 'المؤشر' : 'Metric', ar ? 'القيمة' : 'Value'],
    [
      [ar ? 'النطاق' : 'Scope', data.scopeLabel],
      [ar ? 'الفترة' : 'Period', data.periodLabel],
      [ar ? 'المحاذاة الإجمالية' : 'Overall alignment', (data.overall?.alignmentPct ?? 0) + '%'],
      [ar ? 'مهام منجزة مرتبطة' : 'Aligned completed', data.overall?.alignedCompleted ?? 0],
      [ar ? 'إجمالي المنجزة' : 'Total completed', data.overall?.totalCompleted ?? 0],
      [ar ? 'المهام المفتوحة' : 'Open tasks', totalOpen],
      [ar ? 'المهام المتأخرة' : 'Overdue tasks', totalOverdue],
      [ar ? 'التحديات النشطة' : 'Active challenges', data.challenges.length],
    ],
  );

  // Alignment
  const s2 = wb.addWorksheet(ar ? 'المحاذاة' : 'Alignment');
  styleSheet(s2, ar);
  addTable(
    s2,
    ar ? 'المحاذاة حسب الإدارة' : 'Alignment by department',
    [ar ? 'الإدارة' : 'Department', ar ? 'المحاذاة %' : 'Alignment %', ar ? 'مرتبطة' : 'Aligned', ar ? 'منجزة' : 'Completed'],
    data.perDept.map((d) => [
      ar ? d.departmentNameAr || d.departmentName : d.departmentName,
      d.alignmentPct,
      d.alignedCompleted,
      d.totalCompleted,
    ]),
  );

  // Burden
  const s3 = wb.addWorksheet(ar ? 'عبء العمل' : 'Burden');
  styleSheet(s3, ar);
  addTable(
    s3,
    ar ? 'عبء العمل حسب الإدارة' : 'Workload by department',
    [
      ar ? 'الإدارة' : 'Department', ar ? 'مفتوحة' : 'Open', ar ? 'متأخرة' : 'Overdue',
      ar ? 'الأعضاء' : 'Members', ar ? 'مهام / فرد' : 'Per member',
    ],
    data.burden.map((b) => [
      ar ? b.departmentNameAr || b.departmentName : b.departmentName,
      b.openTasks, b.overdueTasks, b.memberCount, b.openPerMember,
    ]),
  );

  // Challenges
  const s4 = wb.addWorksheet(ar ? 'التحديات' : 'Challenges');
  styleSheet(s4, ar);
  addTable(
    s4,
    ar ? 'التحديات النشطة' : 'Active challenges',
    [
      ar ? 'التحدي' : 'Challenge', ar ? 'الإدارة' : 'Department',
      ar ? 'الحالة' : 'Status', ar ? 'الأولوية' : 'Priority', ar ? 'التقدّم %' : 'Progress %',
    ],
    data.challenges.map((c) => [
      ar ? c.titleAr || c.title : c.title,
      (ar ? c.departmentNameAr || c.departmentName : c.departmentName) || '—',
      c.status,
      c.priority,
      c.completionPercentage,
    ]),
  );

  const buf = await wb.xlsx.writeBuffer();
  download(buf as ArrayBuffer, ar ? `تقرير-المحاذاة-${data.periodLabel}.xlsx` : `alignment-report-${data.periodLabel}.xlsx`);
}

// ---------------------------------------------------------------- Report 2
export async function exportWeeklyExcel(data: WeeklyData, ar: boolean): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const m = data.movement;

  // Movement
  const s1 = wb.addWorksheet(ar ? 'الحركة' : 'Movement');
  styleSheet(s1, ar);
  addTable(
    s1,
    ar ? `التقرير الأسبوعي — ${data.weekLabel}` : `Weekly Report — ${data.weekLabel}`,
    [
      ar ? 'البند' : 'Item', ar ? 'جديد' : 'New', ar ? 'منجز' : 'Closed',
      ar ? 'مُرحّل' : 'Carried over', ar ? 'متأخر (ضمن المُرحّل)' : 'Overdue (within carried)',
    ],
    [
      [ar ? m.tasks.labelAr : m.tasks.label, m.tasks.newCount, m.tasks.closedCount, m.tasks.carriedOver, m.tasks.overdueInCarried],
      [ar ? m.challenges.labelAr : m.challenges.label, m.challenges.newCount, m.challenges.closedCount, m.challenges.carriedOver, '—'],
      [ar ? m.investors.labelAr : m.investors.label, m.investors.newCount, '—', '—', '—'],
      [ar ? 'جلسات عُقدت' : 'Sessions held', m.sessionsHeld, '—', '—', '—'],
    ],
  );
  if (m.challengeProgress.length) {
    addTable(
      s1,
      ar ? 'تقدّم التحديات' : 'Challenge progress',
      [ar ? 'التحدي' : 'Challenge', ar ? 'التقدّم %' : 'Progress %'],
      m.challengeProgress.map((c) => [ar ? c.titleAr || c.title : c.title, c.pct]),
    );
  }

  // Capacity
  const s2 = wb.addWorksheet(ar ? 'الطاقة' : 'Capacity');
  styleSheet(s2, ar);
  const onLeave = data.capacity.filter((p) => p.onLeave);
  addTable(
    s2,
    ar ? 'في إجازة هذا الأسبوع' : 'On leave this week',
    [ar ? 'الاسم' : 'Name', ar ? 'الإدارة' : 'Department', ar ? 'من' : 'From', ar ? 'إلى' : 'To'],
    onLeave.length
      ? onLeave.map((p) => [ar ? p.nameAr || p.name : p.name, p.departmentName || '—', p.leaveFrom ?? '—', p.leaveTo ?? '—'])
      : [[ar ? 'لا أحد' : 'Nobody', '—', '—', '—']],
  );
  addTable(
    s2,
    ar ? 'عبء العمل حسب الإدارة' : 'Workload by department',
    [
      ar ? 'الإدارة' : 'Department', ar ? 'مفتوحة' : 'Open', ar ? 'متأخرة' : 'Overdue',
      ar ? 'الأعضاء' : 'Members', ar ? 'مهام / فرد' : 'Per member',
    ],
    data.burden.map((b) => [
      ar ? b.departmentNameAr || b.departmentName : b.departmentName,
      b.openTasks, b.overdueTasks, b.memberCount, b.openPerMember,
    ]),
  );
  const active = data.capacity.filter((p) => p.tasksClosed > 0).sort((a, b) => b.tasksClosed - a.tasksClosed);
  addTable(
    s2,
    ar
      ? 'نشاط الموظفين (سجل نشاط — ليس تقييم أداء)'
      : 'Employee activity (activity record — NOT a performance score)',
    [ar ? 'الاسم' : 'Name', ar ? 'الإدارة' : 'Department', ar ? 'مهام منجزة' : 'Tasks closed'],
    active.length
      ? active.map((p) => [ar ? p.nameAr || p.name : p.name, p.departmentName || '—', p.tasksClosed])
      : [[ar ? 'لا نشاط' : 'No activity', '—', 0]],
  );

  // Attention
  const s3 = wb.addWorksheet(ar ? 'يتطلب انتباهك' : 'Attention');
  styleSheet(s3, ar);
  const overdue = data.attention.filter((w) => w.kind === 'task');
  const stalled = data.attention.filter((w) => w.kind === 'challenge');
  addTable(
    s3,
    ar ? 'مهام متأخرة' : 'Overdue tasks',
    [ar ? 'المهمة' : 'Task', ar ? 'المسؤول' : 'Assignee', ar ? 'أيام التأخير' : 'Days overdue'],
    overdue.length
      ? overdue.map((w) => [ar ? w.titleAr || w.title : w.title, w.assigneeName, w.daysOverdue ?? 0])
      : [[ar ? 'لا توجد' : 'None', '—', 0]],
  );
  addTable(
    s3,
    ar ? 'تحديات متعثرة' : 'Stalled challenges',
    [ar ? 'التحدي' : 'Challenge', ar ? 'المسؤول' : 'Assignee', ar ? 'التقدّم %' : 'Progress %'],
    stalled.length
      ? stalled.map((w) => [ar ? w.titleAr || w.title : w.title, w.assigneeName, w.pct ?? 0])
      : [[ar ? 'لا توجد' : 'None', '—', 0]],
  );

  // Approvals
  const s4 = wb.addWorksheet(ar ? 'الموافقات' : 'Approvals');
  styleSheet(s4, ar);
  addTable(
    s4,
    ar
      ? `الموافقات المعلّقة — الأقدم منذ ${data.approvals.oldestDays} يوم`
      : `Pending approvals — oldest waiting ${data.approvals.oldestDays} day(s)`,
    [ar ? 'النوع' : 'Type', ar ? 'البند' : 'Item', ar ? 'لدى' : 'Waiting on', ar ? 'أيام الانتظار' : 'Days waiting'],
    data.approvals.items.length
      ? data.approvals.items.map((a) => [a.kind, a.title, a.approverName, a.daysWaiting])
      : [[ar ? 'لا توجد' : 'None', '—', '—', 0]],
  );

  const buf = await wb.xlsx.writeBuffer();
  const stamp = data.weekLabel.slice(0, 10);
  download(buf as ArrayBuffer, ar ? `التقرير-الأسبوعي-${stamp}.xlsx` : `weekly-report-${stamp}.xlsx`);
}
// ---------------------------------------------------------------- Report 4
import type { EmployeePerfData } from '@/components/reports/employee-perf-report';
import { tierFromComposite, tierLabel } from '@/lib/dashboard/scoring';

export async function exportEmployeeExcel(data: EmployeePerfData, ar: boolean): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const ranked = [...data.rows].sort((a, b) => b.yearly - a.yearly);

  // How to read the scores — the legend comes FIRST, as in the PDF.
  const s0 = wb.addWorksheet(ar ? 'كيف تُقرأ' : 'How to read');
  styleSheet(s0, ar);
  addTable(
    s0,
    ar ? 'الدرجة المركّبة (0–100): حجم العمل + سرعة الإنجاز' : 'Composite score (0–100): work volume + speed',
    [ar ? 'الفئة' : 'Band', ar ? 'النطاق' : 'Range'],
    [
      [tierLabel('super', ar), '80 – 100'],
      [tierLabel('high', ar), '60 – 79'],
      [tierLabel('medium', ar), '40 – 59'],
      [tierLabel('low', ar), ar ? 'أقل من 40' : 'Under 40'],
      [ar ? 'فراغ' : 'Dash', ar ? 'لا نشاط مسجّل — وليس أداءً ضعيفًا' : 'No recorded activity — NOT poor performance'],
    ],
  );

  // Yearly, ranked, with band.
  const s1 = wb.addWorksheet(ar ? 'الأداء السنوي' : 'Yearly');
  styleSheet(s1, ar);
  addTable(
    s1,
    ar ? `الأداء السنوي ${data.year} — ${data.scopeLabel}` : `Yearly performance ${data.year} — ${data.scopeLabel}`,
    [ar ? 'الموظف' : 'Employee', ar ? 'الدرجة' : 'Score', ar ? 'الفئة' : 'Band'],
    ranked.map((r) => [
      ar ? r.nameAr || r.name : r.name,
      r.yearly,
      tierLabel(tierFromComposite(r.yearly), ar),
    ]),
  );

  // The month-by-month matrix.
  const s2 = wb.addWorksheet(ar ? 'الأداء الشهري' : 'Monthly');
  styleSheet(s2, ar);
  addTable(
    s2,
    ar ? 'الدرجات الشهرية' : 'Monthly scores',
    [ar ? 'الموظف' : 'Employee', ...data.monthLabels, ar ? 'السنة' : 'Year'],
    ranked.map((r) => [
      ar ? r.nameAr || r.name : r.name,
      ...r.cells.map((c) => (c && c.composite > 0 ? c.composite : '—')),
      r.yearly,
    ]),
  );

  const buf = await wb.xlsx.writeBuffer();
  download(buf as ArrayBuffer, ar ? `أداء-الموظفين-${data.year}.xlsx` : `employee-performance-${data.year}.xlsx`);
}
