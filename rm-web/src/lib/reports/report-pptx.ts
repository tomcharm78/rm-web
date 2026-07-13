// PPTX export for Report 1 (Alignment) and Report 2 (Weekly).
//
// Native slides — real PowerPoint text and tables, not page screenshots.
// PowerPoint does its own Arabic BiDi shaping, so rtlMode text renders correctly
// (proven by the KPI Scorecards deck). Charts are captured from the canvases the
// preview has already rendered.
//
// PptxGenJS comes from CDN: its npm package pulls node:fs / node:https, which
// webpack cannot bundle for the client. Same pattern as Chart.js.
import type { ReportData } from '@/components/reports/dept-alignment-report';
import type { WeeklyData } from '@/components/reports/weekly-report';

const GREEN = '199E70';
const ORANGE = 'C2410C';
const INK = '1A1A1A';
const GREY = '666666';
const W = 13.333; // 16:9 inches

// Rows that fit on one slide's table before it must continue on the next.
const ROWS_PER_SLIDE = 11;

function loadPptxGen(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { PptxGenJS?: any };
    if (w.PptxGenJS) return resolve(w.PptxGenJS);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js';
    s.onload = () => (w.PptxGenJS ? resolve(w.PptxGenJS) : reject(new Error('PptxGenJS failed to load')));
    s.onerror = () => reject(new Error('PptxGenJS CDN load failed'));
    document.head.appendChild(s);
  });
}

/** Grab a chart image from the preview that's already on screen. */
function chartPng(id: string): string | null {
  // The engine renders each chart into a canvas inside a .report-page.
  const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('.report-page canvas'));
  // Charts are appended in block order; the engine keys them by id via its own
  // ref map, so we match by index of the requested id among rendered charts.
  const el = canvases.find((c) => (c as any)._chartId === id) ?? canvases[chartIndex(id)];
  if (!el) return null;
  try { return el.toDataURL('image/png'); } catch { return null; }
}
function chartIndex(id: string): number {
  // align/burden for report 1; burden for weekly.
  return id === 'align' ? 0 : id === 'burden' ? (document.querySelectorAll('.report-page canvas').length > 1 ? 1 : 0) : 0;
}

type Pptx = any;

function titleSlide(pptx: Pptx, ar: boolean, title: string, org: string, meta: string) {
  const s = pptx.addSlide();
  s.addShape('rect', { x: 0, y: 0, w: W, h: 1.4, fill: { color: GREEN } });
  s.addText(title, {
    x: 0.6, y: 2.6, w: W - 1.2, h: 0.9,
    fontSize: 34, bold: true, color: INK,
    align: ar ? 'right' : 'left', rtlMode: ar,
  });
  s.addText(org, {
    x: 0.6, y: 3.6, w: W - 1.2, h: 0.5,
    fontSize: 18, color: GREY, align: ar ? 'right' : 'left', rtlMode: ar,
  });
  s.addText(meta, {
    x: 0.6, y: 4.2, w: W - 1.2, h: 0.4,
    fontSize: 13, color: '999999', align: ar ? 'right' : 'left', rtlMode: ar,
  });
}

function sectionSlide(pptx: Pptx, ar: boolean, heading: string): Pptx {
  const s = pptx.addSlide();
  s.addShape('rect', { x: 0, y: 0, w: W, h: 0.75, fill: { color: GREEN } });
  s.addText(heading, {
    x: 0.4, y: 0.08, w: W - 0.8, h: 0.6,
    fontSize: 19, bold: true, color: 'FFFFFF',
    align: ar ? 'right' : 'left', valign: 'middle', rtlMode: ar,
  });
  return s;
}

function addStats(s: Pptx, ar: boolean, items: { label: string; value: string; danger?: boolean }[], y = 1.1) {
  const gap = 0.25;
  const w = (W - 0.8 - gap * (items.length - 1)) / items.length;
  items.forEach((it, i) => {
    const x = ar ? W - 0.4 - w - i * (w + gap) : 0.4 + i * (w + gap);
    s.addShape('rect', { x, y, w, h: 1.05, fill: { color: 'F7F7F7' }, line: { color: 'DDDDDD', width: 0.75 } });
    s.addText(it.label, {
      x: x + 0.12, y: y + 0.08, w: w - 0.24, h: 0.3,
      fontSize: 10, color: GREY, align: ar ? 'right' : 'left', rtlMode: ar,
    });
    s.addText(it.value, {
      x: x + 0.12, y: y + 0.38, w: w - 0.24, h: 0.55,
      fontSize: 22, bold: true, color: it.danger ? ORANGE : INK,
      align: ar ? 'right' : 'left', rtlMode: ar, shrinkText: true,
    });
  });
}

/** A table, split across continuation slides when it's too long. */
function addTable(
  pptx: Pptx, ar: boolean, heading: string,
  head: string[], rows: (string | number)[][],
  opts?: { y?: number; slide?: Pptx },
) {
  const chunks: (string | number)[][][] = [];
  for (let i = 0; i < Math.max(rows.length, 1); i += ROWS_PER_SLIDE) {
    chunks.push(rows.slice(i, i + ROWS_PER_SLIDE));
  }

  chunks.forEach((chunk, ci) => {
    const s = ci === 0 && opts?.slide ? opts.slide : sectionSlide(pptx, ar, ci === 0 ? heading : `${heading} (${ci + 1})`);
    const y = ci === 0 && opts?.slide ? (opts.y ?? 2.4) : 1.1;

    const headCells = (ar ? [...head].reverse() : head).map((h) => ({
      text: h,
      options: { bold: true, fill: { color: 'F0F7F4' }, color: INK, align: 'center', fontSize: 11 },
    }));
    const bodyRows = chunk.map((r) => (ar ? [...r].reverse() : r).map((c, i) => ({
      text: String(c),
      options: {
        align: (ar ? (i === r.length - 1 ? 'right' : 'center') : (i === 0 ? 'left' : 'center')) as any,
        color: INK, fontSize: 11, rtlMode: ar,
      },
    })));

    s.addTable([headCells, ...(bodyRows.length ? bodyRows : [[{ text: ar ? 'لا توجد بيانات' : 'No data', options: { fontSize: 11 } }]])], {
      x: 0.4, y, w: W - 0.8,
      border: { type: 'solid', color: 'DDDDDD', pt: 0.5 },
      valign: 'middle', rowH: 0.34, fontSize: 11,
    });
  });
}

function addChart(s: Pptx, id: string, y = 1.15, h = 3.2) {
  const png = chartPng(id);
  if (!png) return false;
  s.addImage({ data: png, x: 0.9, y, w: W - 1.8, h });
  return true;
}

// ---------------------------------------------------------------- Report 1
export async function exportAlignmentPptx(data: ReportData, ar: boolean): Promise<void> {
  const PptxGenJS = await loadPptxGen();
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';

  const totalOpen = data.burden.reduce((s, b) => s + b.openTasks, 0);
  const totalOverdue = data.burden.reduce((s, b) => s + b.overdueTasks, 0);

  titleSlide(
    pptx, ar,
    ar ? 'تقرير محاذاة الإدارات والنشاط' : 'Department Alignment & Activity Report',
    ar ? data.orgNameAr || data.orgName : data.orgName,
    `${ar ? 'النطاق: ' : 'Scope: '}${data.scopeLabel} · ${ar ? 'الفترة: ' : 'Period: '}${data.periodLabel}`,
  );

  // Executive summary
  const s1 = sectionSlide(pptx, ar, ar ? 'الملخص التنفيذي' : 'Executive summary');
  addStats(s1, ar, [
    { label: ar ? 'المحاذاة الإجمالية' : 'Overall alignment', value: (data.overall?.alignmentPct ?? 0) + '%' },
    { label: ar ? 'المهام المفتوحة' : 'Open tasks', value: String(totalOpen) },
    { label: ar ? 'المتأخرة' : 'Overdue', value: String(totalOverdue), danger: totalOverdue > 0 },
    { label: ar ? 'التحديات النشطة' : 'Active challenges', value: String(data.challenges.length) },
  ]);
  s1.addText(
    ar
      ? `بلغت نسبة المحاذاة الإجمالية ${data.overall?.alignmentPct ?? 0}% (${data.overall?.alignedCompleted ?? 0} من ${data.overall?.totalCompleted ?? 0} مهمة منجزة مرتبطة بأهداف). يشمل التقرير ${data.burden.length} إدارة، بإجمالي ${totalOpen} مهمة مفتوحة، منها ${totalOverdue} متأخرة.`
      : `Overall alignment stands at ${data.overall?.alignmentPct ?? 0}% (${data.overall?.alignedCompleted ?? 0} of ${data.overall?.totalCompleted ?? 0} completed tasks linked to goals). ${data.burden.length} department(s), ${totalOpen} open tasks, ${totalOverdue} overdue.`,
    { x: 0.4, y: 2.5, w: W - 0.8, h: 1.2, fontSize: 14, color: '444444', align: ar ? 'right' : 'left', rtlMode: ar },
  );

  // Alignment — chart then table
  const s2 = sectionSlide(pptx, ar, ar ? 'المحاذاة حسب الإدارة' : 'Alignment by department');
  addChart(s2, 'align');
  addTable(
    pptx, ar,
    ar ? 'المحاذاة حسب الإدارة' : 'Alignment by department',
    [ar ? 'الإدارة' : 'Department', ar ? 'المحاذاة' : 'Alignment', ar ? 'مرتبطة / منجزة' : 'Aligned / Completed'],
    data.perDept.map((d) => [
      ar ? d.departmentNameAr || d.departmentName : d.departmentName,
      d.alignmentPct + '%',
      `${d.alignedCompleted} / ${d.totalCompleted}`,
    ]),
  );

  // Burden — chart then table
  const s3 = sectionSlide(pptx, ar, ar ? 'عبء العمل' : 'Workload / burden');
  addChart(s3, 'burden');
  addTable(
    pptx, ar,
    ar ? 'عبء العمل' : 'Workload / burden',
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
  addTable(
    pptx, ar,
    ar ? 'التحديات' : 'Challenges',
    [ar ? 'التحدي' : 'Challenge', ar ? 'الإدارة' : 'Department', ar ? 'التقدّم' : 'Progress'],
    data.challenges.map((c) => [
      ar ? c.titleAr || c.title : c.title,
      (ar ? c.departmentNameAr || c.departmentName : c.departmentName) || '—',
      c.completionPercentage + '%',
    ]),
  );

  await pptx.writeFile({
    fileName: ar ? `تقرير-المحاذاة-${data.periodLabel}.pptx` : `alignment-report-${data.periodLabel}.pptx`,
  });
}

// ---------------------------------------------------------------- Report 2
export async function exportWeeklyPptx(data: WeeklyData, ar: boolean): Promise<void> {
  const PptxGenJS = await loadPptxGen();
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';

  const m = data.movement;
  const onLeave = data.capacity.filter((p) => p.onLeave);
  const onDuty = data.capacity.filter((p) => !p.onLeave);

  titleSlide(
    pptx, ar,
    ar ? 'التقرير الأسبوعي' : 'Weekly Report',
    ar ? data.orgNameAr || data.orgName : data.orgName,
    `${ar ? 'النطاق: ' : 'Scope: '}${data.scopeLabel} · ${ar ? 'الأسبوع: ' : 'Week: '}${data.weekLabel}`,
  );

  // §1 Movement
  const s1 = sectionSlide(pptx, ar, ar ? 'الحركة — ما الذي تغيّر' : 'Movement — what changed');
  addStats(s1, ar, [
    { label: ar ? 'مهام جديدة' : 'New tasks', value: String(m.tasks.newCount) },
    { label: ar ? 'مهام منجزة' : 'Tasks closed', value: String(m.tasks.closedCount) },
    { label: ar ? 'مُرحّلة' : 'Carried over', value: String(m.tasks.carriedOver) },
    { label: ar ? 'منها متأخرة' : 'of which overdue', value: String(m.tasks.overdueInCarried), danger: m.tasks.overdueInCarried > 0 },
  ]);
  addTable(
    pptx, ar, ar ? 'الحركة — ما الذي تغيّر' : 'Movement — what changed',
    [
      ar ? 'البند' : 'Item', ar ? 'جديد' : 'New', ar ? 'منجز' : 'Closed',
      ar ? 'مُرحّل' : 'Carried', ar ? 'متأخر' : 'Overdue',
    ],
    [
      [ar ? m.tasks.labelAr : m.tasks.label, m.tasks.newCount, m.tasks.closedCount, m.tasks.carriedOver, m.tasks.overdueInCarried],
      [ar ? m.challenges.labelAr : m.challenges.label, m.challenges.newCount, m.challenges.closedCount, m.challenges.carriedOver, '—'],
      [ar ? m.investors.labelAr : m.investors.label, m.investors.newCount, '—', '—', '—'],
      [ar ? 'جلسات عُقدت' : 'Sessions held', m.sessionsHeld, '—', '—', '—'],
    ],
    { slide: s1, y: 2.5 },
  );

  // §2 Capacity
  const s2 = sectionSlide(pptx, ar, ar ? 'الطاقة الاستيعابية' : 'Capacity');
  addStats(s2, ar, [
    { label: ar ? 'على رأس العمل' : 'On duty', value: String(onDuty.length) },
    { label: ar ? 'في إجازة' : 'On leave', value: String(onLeave.length) },
    { label: ar ? 'إجمالي الفريق' : 'Team size', value: String(data.capacity.length) },
  ]);
  if (onLeave.length) {
    addTable(
      pptx, ar, ar ? 'في إجازة هذا الأسبوع' : 'On leave this week',
      [ar ? 'الاسم' : 'Name', ar ? 'الإدارة' : 'Department', ar ? 'من' : 'From', ar ? 'إلى' : 'To'],
      onLeave.map((p) => [ar ? p.nameAr || p.name : p.name, p.departmentName || '—', p.leaveFrom ?? '—', p.leaveTo ?? '—']),
      { slide: s2, y: 2.5 },
    );
  }

  // Burden chart + table
  const s3 = sectionSlide(pptx, ar, ar ? 'عبء العمل حسب الإدارة' : 'Workload by department');
  addChart(s3, 'burden');
  addTable(
    pptx, ar, ar ? 'عبء العمل حسب الإدارة' : 'Workload by department',
    [
      ar ? 'الإدارة' : 'Department', ar ? 'مفتوحة' : 'Open', ar ? 'متأخرة' : 'Overdue',
      ar ? 'الأعضاء' : 'Members', ar ? 'مهام / فرد' : 'Per member',
    ],
    data.burden.map((b) => [
      ar ? b.departmentNameAr || b.departmentName : b.departmentName,
      b.openTasks, b.overdueTasks, b.memberCount, b.openPerMember,
    ]),
  );

  // Employee activity — with the caveat carried onto the slide.
  const active = data.capacity.filter((p) => p.tasksClosed > 0).sort((a, b) => b.tasksClosed - a.tasksClosed);
  if (active.length) {
    const s4 = sectionSlide(pptx, ar, ar ? 'نشاط الموظفين' : 'Employee activity');
    s4.addText(
      ar
        ? 'سجل نشاط — وليس تقييم أداء. التقييم المُحتسب يصدر شهريًا/ربعيًا.'
        : 'Activity record — NOT a performance score. Scored performance is issued monthly/quarterly.',
      { x: 0.4, y: 0.95, w: W - 0.8, h: 0.4, fontSize: 11, italic: true, color: GREY, align: ar ? 'right' : 'left', rtlMode: ar },
    );
    addTable(
      pptx, ar, ar ? 'نشاط الموظفين' : 'Employee activity',
      [ar ? 'الاسم' : 'Name', ar ? 'الإدارة' : 'Department', ar ? 'مهام منجزة' : 'Tasks closed'],
      active.map((p) => [ar ? p.nameAr || p.name : p.name, p.departmentName || '—', p.tasksClosed]),
      { slide: s4, y: 1.5 },
    );
  }

  // §3 Attention
  const overdue = data.attention.filter((w) => w.kind === 'task');
  const stalled = data.attention.filter((w) => w.kind === 'challenge');

  if (overdue.length) {
    addTable(
      pptx, ar, ar ? 'مهام متأخرة — تتطلب انتباهك' : 'Overdue tasks — needs attention',
      [ar ? 'المهمة' : 'Task', ar ? 'المسؤول' : 'Assignee', ar ? 'التأخير' : 'Overdue by'],
      overdue.map((w) => [
        ar ? w.titleAr || w.title : w.title,
        w.assigneeName,
        ar ? `${w.daysOverdue} يوم` : `${w.daysOverdue} day(s)`,
      ]),
    );
  }
  if (stalled.length) {
    addTable(
      pptx, ar, ar ? 'تحديات متعثرة' : 'Stalled challenges',
      [ar ? 'التحدي' : 'Challenge', ar ? 'المسؤول' : 'Assignee', ar ? 'التقدّم' : 'Progress'],
      stalled.map((w) => [ar ? w.titleAr || w.title : w.title, w.assigneeName, `${w.pct}%`]),
    );
  }
  if (data.approvals.items.length) {
    addTable(
      pptx, ar,
      ar ? `الموافقات المعلّقة — الأقدم منذ ${data.approvals.oldestDays} يوم` : `Pending approvals — oldest ${data.approvals.oldestDays} day(s)`,
      [ar ? 'النوع' : 'Type', ar ? 'البند' : 'Item', ar ? 'لدى' : 'Waiting on', ar ? 'منذ' : 'Days'],
      data.approvals.items.map((a) => [a.kind, a.title, a.approverName, a.daysWaiting]),
    );
  }

  const stamp = data.weekLabel.slice(0, 10);
  await pptx.writeFile({
    fileName: ar ? `التقرير-الأسبوعي-${stamp}.pptx` : `weekly-report-${stamp}.pptx`,
  });
}
