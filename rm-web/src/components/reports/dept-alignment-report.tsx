'use client';
// REPORT 1 — Department Alignment & Activity.
// The *state* report: how things stand. All pagination/measuring/chrome lives in
// the shared engine; this file only decides WHAT goes in the report.
import {
  PaginatedReport, GREEN, ORANGE,
  type Block, type ChartSpec, type ReportSettings,
} from './paginated-report';
import type { DeptAlignmentNamed } from '@/lib/kpi/dashboard-alignment-queries';
import type { DepartmentBurden, ReportChallenge } from '@/lib/reports/queries';

export { DEFAULT_SETTINGS, type ReportSettings } from './paginated-report';

export type ReportData = {
  overall: { alignmentPct: number; alignedCompleted: number; totalCompleted: number } | null;
  perDept: DeptAlignmentNamed[];
  burden: DepartmentBurden[];
  challenges: ReportChallenge[];
  orgName: string; orgNameAr: string;
  periodLabel: string; scopeLabel: string;
};

export function DeptAlignmentReport({
  data, ar, settings,
}: { data: ReportData; ar: boolean; settings: ReportSettings }) {
  const blocks: Block[] = [];
  const totalOpen = data.burden.reduce((s, b) => s + b.openTasks, 0);
  const totalOverdue = data.burden.reduce((s, b) => s + b.overdueTasks, 0);

  // §1 Executive summary
  blocks.push({ kind: 'h2', text: ar ? '١. الملخص التنفيذي' : '1. Executive summary' });
  blocks.push({
    kind: 'stats',
    items: [
      { label: ar ? 'المحاذاة الإجمالية' : 'Overall alignment', value: (data.overall?.alignmentPct ?? 0) + '%' },
      { label: ar ? 'المهام المفتوحة' : 'Open tasks', value: String(totalOpen) },
      { label: ar ? 'المتأخرة' : 'Overdue', value: String(totalOverdue), danger: totalOverdue > 0 },
      { label: ar ? 'التحديات النشطة' : 'Active challenges', value: String(data.challenges.length) },
    ],
  });
  blocks.push({
    kind: 'para',
    text: ar
      ? `بلغت نسبة المحاذاة الإجمالية ${data.overall?.alignmentPct ?? 0}% (${data.overall?.alignedCompleted ?? 0} من ${data.overall?.totalCompleted ?? 0} مهمة منجزة مرتبطة بأهداف). يشمل هذا التقرير ${data.burden.length} إدارة، بإجمالي ${totalOpen} مهمة مفتوحة، منها ${totalOverdue} متأخرة.`
      : `Overall alignment stands at ${data.overall?.alignmentPct ?? 0}% (${data.overall?.alignedCompleted ?? 0} of ${data.overall?.totalCompleted ?? 0} completed tasks linked to goals). This report covers ${data.burden.length} department(s), with ${totalOpen} open tasks, of which ${totalOverdue} are overdue.`,
  });

  // §2 Alignment
  blocks.push({ kind: 'h2', text: ar ? '٢. المحاذاة حسب الإدارة' : '2. Alignment by department' });
  if (data.perDept.length) {
    blocks.push({ kind: 'chart', id: 'align' });
    blocks.push({
      kind: 'table', id: 'align', accent: '#f0f7f4',
      head: [ar ? 'الإدارة' : 'Department', ar ? 'المحاذاة' : 'Alignment', ar ? 'مرتبطة / منجزة' : 'Aligned / Completed'],
      rows: data.perDept.map((d) => [
        ar ? d.departmentNameAr || d.departmentName : d.departmentName,
        d.alignmentPct + '%',
        `${d.alignedCompleted} / ${d.totalCompleted}`,
      ]),
    });
  } else blocks.push({ kind: 'empty', text: ar ? 'لا توجد بيانات.' : 'No data.' });

  // §3 Burden
  blocks.push({ kind: 'h2', text: ar ? '٣. عبء العمل' : '3. Workload / burden' });
  if (data.burden.length) {
    blocks.push({ kind: 'chart', id: 'burden' });
    blocks.push({
      kind: 'table', id: 'burden', accent: '#fdf3ef',
      head: [
        ar ? 'الإدارة' : 'Department', ar ? 'مفتوحة' : 'Open', ar ? 'متأخرة' : 'Overdue',
        ar ? 'الأعضاء' : 'Members', ar ? 'مهام / فرد' : 'Per member',
      ],
      rows: data.burden.map((b) => [
        ar ? b.departmentNameAr || b.departmentName : b.departmentName,
        b.openTasks, b.overdueTasks, b.memberCount, b.openPerMember,
      ]),
    });
  } else blocks.push({ kind: 'empty', text: ar ? 'لا توجد بيانات.' : 'No data.' });

  // §4 Challenges — named, with progress %
  blocks.push({ kind: 'h2', text: ar ? '٤. التحديات' : '4. Challenges' });
  if (data.challenges.length) {
    const byDept = new Map<string, ReportChallenge[]>();
    for (const c of data.challenges) {
      const key = (ar ? c.departmentNameAr || c.departmentName : c.departmentName) || (ar ? 'غير مُسند' : 'Unassigned');
      if (!byDept.has(key)) byDept.set(key, []);
      byDept.get(key)!.push(c);
    }
    for (const [dept, list] of byDept) {
      blocks.push({ kind: 'label', text: dept });
      for (const c of list) {
        blocks.push({ kind: 'bar', title: ar ? c.titleAr || c.title : c.title, pct: c.completionPercentage });
      }
    }
  } else blocks.push({ kind: 'empty', text: ar ? 'لا توجد تحديات نشطة.' : 'No active challenges.' });

  const charts: ChartSpec[] = [
    {
      id: 'align',
      labels: data.perDept.map((d) => (ar ? d.departmentNameAr || d.departmentName : d.departmentName)),
      values: data.perDept.map((d) => d.alignmentPct),
      color: GREEN,
    },
    {
      id: 'burden',
      labels: data.burden.map((b) => (ar ? b.departmentNameAr || b.departmentName : b.departmentName)),
      values: data.burden.map((b) => b.openPerMember),
      color: ORANGE,
    },
  ];

  return (
    <PaginatedReport
      blocks={blocks}
      charts={charts}
      ar={ar}
      settings={settings}
      title={ar ? 'تقرير محاذاة الإدارات والنشاط' : 'Department Alignment & Activity Report'}
      subtitle={ar ? data.orgNameAr || data.orgName : data.orgName}
      meta={`${ar ? 'النطاق: ' : 'Scope: '}${data.scopeLabel} · ${ar ? 'الفترة: ' : 'Period: '}${data.periodLabel}`}
    />
  );
}
