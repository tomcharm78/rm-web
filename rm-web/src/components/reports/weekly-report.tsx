'use client';
// REPORT 2 — WEEKLY REPORT. The *delta* report: what MOVED this week.
//
// Principle: direct attention, don't dump metrics.
//   §1 Movement  — new / closed / carried-over (overdue = severity WITHIN carried)
//   §2 Capacity  — on duty vs on leave; burden; employee ACTIVITY (never scored)
//   §3 Attention — the most-read page: named overdue/stalled work, and approval
//                  bottlenecks (who is sitting on what, and for how long)
import {
  PaginatedReport, GREEN, ORANGE,
  type Block, type ChartSpec, type ReportSettings,
} from './paginated-report';
import type { DepartmentBurden } from '@/lib/reports/queries';
import type { Movement, CapacityPerson, WatchItem, ApprovalBottleneck } from '@/lib/reports/weekly-queries';

export type WeeklyData = {
  movement: Movement;
  capacity: CapacityPerson[];
  burden: DepartmentBurden[];
  attention: WatchItem[];
  approvals: { pendingTotal: number; oldestDays: number; items: ApprovalBottleneck[] };
  orgName: string; orgNameAr: string;
  weekLabel: string;
  scopeLabel: string;
};

export function WeeklyReport({
  data, ar, settings,
}: { data: WeeklyData; ar: boolean; settings: ReportSettings }) {
  const blocks: Block[] = [];
  const m = data.movement;

  const onLeave = data.capacity.filter((p) => p.onLeave);
  const onDuty = data.capacity.filter((p) => !p.onLeave);

  // ------------------------------------------------------------- §1 MOVEMENT
  blocks.push({ kind: 'h2', text: ar ? '١. الحركة — ما الذي تغيّر هذا الأسبوع' : '1. Movement — what changed this week' });
  blocks.push({
    kind: 'stats',
    items: [
      { label: ar ? 'مهام جديدة' : 'New tasks', value: String(m.tasks.newCount) },
      { label: ar ? 'مهام منجزة' : 'Tasks closed', value: String(m.tasks.closedCount) },
      { label: ar ? 'مهام مُرحّلة' : 'Carried over', value: String(m.tasks.carriedOver) },
      { label: ar ? 'منها متأخرة' : 'of which overdue', value: String(m.tasks.overdueInCarried), danger: m.tasks.overdueInCarried > 0 },
    ],
  });
  blocks.push({
    kind: 'table', id: 'movement', accent: '#f0f7f4',
    head: [
      ar ? 'البند' : 'Item',
      ar ? 'جديد' : 'New',
      ar ? 'منجز' : 'Closed',
      ar ? 'مُرحّل' : 'Carried over',
      ar ? 'متأخر (ضمن المُرحّل)' : 'Overdue (within carried)',
    ],
    rows: [
      [ar ? m.tasks.labelAr : m.tasks.label, m.tasks.newCount, m.tasks.closedCount, m.tasks.carriedOver, m.tasks.overdueInCarried],
      [ar ? m.challenges.labelAr : m.challenges.label, m.challenges.newCount, m.challenges.closedCount, m.challenges.carriedOver, '—'],
      [ar ? m.investors.labelAr : m.investors.label, m.investors.newCount, '—', '—', '—'],
    ],
  });
  blocks.push({
    kind: 'note',
    text: ar
      ? `عُقدت ${m.sessionsHeld} جلسة هذا الأسبوع.`
      : `${m.sessionsHeld} session(s) held this week.`,
  });

  // Challenge progress — the long-running work, least progress first.
  if (m.challengeProgress.length) {
    blocks.push({ kind: 'label', text: ar ? 'تقدّم التحديات النشطة' : 'Active challenge progress' });
    for (const c of m.challengeProgress.slice(0, 10)) {
      blocks.push({ kind: 'bar', title: ar ? c.titleAr || c.title : c.title, pct: c.pct });
    }
  }

  // ------------------------------------------------------------- §2 CAPACITY
  blocks.push({ kind: 'h2', text: ar ? '٢. الطاقة الاستيعابية' : '2. Capacity' });
  blocks.push({
    kind: 'stats',
    items: [
      { label: ar ? 'على رأس العمل' : 'On duty', value: String(onDuty.length) },
      { label: ar ? 'في إجازة' : 'On leave', value: String(onLeave.length) },
      { label: ar ? 'إجمالي الفريق' : 'Team size', value: String(data.capacity.length) },
    ],
  });

  if (onLeave.length) {
    blocks.push({ kind: 'label', text: ar ? 'في إجازة هذا الأسبوع' : 'On leave this week' });
    blocks.push({
      kind: 'table', id: 'leave', accent: '#fdf3ef',
      head: [ar ? 'الاسم' : 'Name', ar ? 'الإدارة' : 'Department', ar ? 'من' : 'From', ar ? 'إلى' : 'To'],
      rows: onLeave.map((p) => [
        ar ? p.nameAr || p.name : p.name,
        p.departmentName || '—',
        p.leaveFrom ?? '—',
        p.leaveTo ?? '—',
      ]),
    });
  }

  // Burden per department (reuses Report 1's query).
  if (data.burden.length) {
    blocks.push({ kind: 'label', text: ar ? 'عبء العمل حسب الإدارة' : 'Workload by department' });
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
  }

  // Employee ACTIVITY — explicitly not a performance score.
  const active = data.capacity.filter((p) => p.tasksClosed > 0).sort((a, b) => b.tasksClosed - a.tasksClosed);
  if (active.length) {
    blocks.push({ kind: 'label', text: ar ? 'نشاط الموظفين هذا الأسبوع' : 'Employee activity this week' });
    blocks.push({
      kind: 'note',
      text: ar
        ? 'هذا سجل نشاط وليس تقييم أداء. التقييم المُحتسب يصدر شهريًا/ربعيًا.'
        : 'This is an activity record, not a performance score. Scored performance is issued monthly/quarterly.',
    });
    blocks.push({
      kind: 'table', id: 'activity', accent: '#f0f7f4',
      head: [ar ? 'الاسم' : 'Name', ar ? 'الإدارة' : 'Department', ar ? 'مهام منجزة' : 'Tasks closed'],
      rows: active.map((p) => [
        ar ? p.nameAr || p.name : p.name,
        p.departmentName || '—',
        p.tasksClosed,
      ]),
    });
  }

  // ------------------------------------------------------------- §3 ATTENTION
  blocks.push({ kind: 'h2', text: ar ? '٣. يتطلب انتباهك' : '3. Needs your attention' });

  if (data.attention.length === 0 && data.approvals.pendingTotal === 0) {
    blocks.push({ kind: 'empty', text: ar ? 'لا توجد بنود عالقة. أسبوع نظيف.' : 'Nothing outstanding. A clean week.' });
  }

  const overdueTasks = data.attention.filter((w) => w.kind === 'task');
  const stalled = data.attention.filter((w) => w.kind === 'challenge');

  if (overdueTasks.length) {
    blocks.push({ kind: 'label', text: ar ? 'مهام متأخرة' : 'Overdue tasks' });
    blocks.push({
      kind: 'table', id: 'overdue', accent: '#fdf3ef',
      head: [ar ? 'المهمة' : 'Task', ar ? 'المسؤول' : 'Assignee', ar ? 'التأخير' : 'Overdue by'],
      rows: overdueTasks.map((w) => [
        ar ? w.titleAr || w.title : w.title,
        w.assigneeName,
        ar ? `${w.daysOverdue} يوم` : `${w.daysOverdue} day(s)`,
      ]),
    });
  }

  if (stalled.length) {
    blocks.push({ kind: 'label', text: ar ? 'تحديات متعثرة' : 'Stalled challenges' });
    blocks.push({
      kind: 'table', id: 'stalled', accent: '#fdf3ef',
      head: [ar ? 'التحدي' : 'Challenge', ar ? 'المسؤول' : 'Assignee', ar ? 'التقدّم' : 'Progress'],
      rows: stalled.map((w) => [
        ar ? w.titleAr || w.title : w.title,
        w.assigneeName,
        `${w.pct}%`,
      ]),
    });
  }

  // Approvals — the bottleneck view: who is holding things up.
  blocks.push({ kind: 'label', text: ar ? 'الموافقات المعلّقة' : 'Pending approvals' });
  if (data.approvals.pendingTotal === 0) {
    blocks.push({ kind: 'empty', text: ar ? 'لا توجد موافقات معلّقة.' : 'No pending approvals.' });
  } else {
    blocks.push({
      kind: 'note',
      danger: data.approvals.oldestDays > 7,
      text: ar
        ? `${data.approvals.pendingTotal} طلب في انتظار القرار. الأقدم ينتظر منذ ${data.approvals.oldestDays} يوم.`
        : `${data.approvals.pendingTotal} request(s) awaiting a decision. The oldest has been waiting ${data.approvals.oldestDays} day(s).`,
    });
    blocks.push({
      kind: 'table', id: 'approvals', accent: '#fdf3ef',
      head: [ar ? 'النوع' : 'Type', ar ? 'البند' : 'Item', ar ? 'لدى' : 'Waiting on', ar ? 'منذ' : 'Days waiting'],
      rows: data.approvals.items.map((a) => [
        a.kind,
        a.title,
        a.approverName,
        a.daysWaiting,
      ]),
    });
  }

  const charts: ChartSpec[] = [
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
      title={ar ? 'التقرير الأسبوعي' : 'Weekly Report'}
      subtitle={ar ? data.orgNameAr || data.orgName : data.orgName}
      meta={`${ar ? 'النطاق: ' : 'Scope: '}${data.scopeLabel} · ${ar ? 'الأسبوع: ' : 'Week: '}${data.weekLabel}`}
    />
  );
}
