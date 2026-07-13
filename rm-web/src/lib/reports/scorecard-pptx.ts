// KPI SCORECARD — PPTX generator.
// One 16:9 slide per department goal, styled after the MOH scorecard sample:
// olive/green banded header, gold label boxes on the start side, white value
// boxes, Q1–Q4 target strip, and a linked-tasks table with completion %.
//
// PptxGenJS writes REAL text (not images). Arabic goes in with align:'right' +
// rtlMode — this file doubles as the PPTX-Arabic proof for Reports 1 & 2.
import type { Scorecard } from './scorecard-queries';

// MOH-ish palette from the sample.
const OLIVE = '8a8f6a';
const OLIVE_DARK = '6f7455';
const GOLD = 'b3a476';
const GOLD_FILL = 'c9bd93';
const CREAM = 'e9e4d2';
const INK = '2b2b2b';

const W = 13.333; // 16:9 inches
// const H = 7.5;

export async function exportScorecardsPptx(cards: Scorecard[], ar: boolean, scopeLabel: string): Promise<void> {
  const PptxGenJS = await loadPptxGen();
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';

  // ---------- title slide
  const t = pptx.addSlide();
  t.background = { color: 'FFFFFF' };
  t.addShape('rect', { x: 0, y: 0, w: W, h: 1.5, fill: { color: OLIVE } });
  t.addShape('rect', { x: 0, y: 1.5, w: W, h: 0.12, fill: { color: GOLD } });
  t.addText(ar ? 'بطاقات مؤشرات قياس الأداء التنفيذي' : 'Executive KPI Scorecards', {
    x: 0.5, y: 2.6, w: W - 1, h: 1.0,
    fontSize: 34, bold: true, color: INK,
    align: ar ? 'right' : 'left', rtlMode: ar,
  });
  t.addText(scopeLabel, {
    x: 0.5, y: 3.7, w: W - 1, h: 0.5,
    fontSize: 18, color: '666666',
    align: ar ? 'right' : 'left', rtlMode: ar,
  });

  // ---------- one card per goal
  for (const c of cards) {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };

    // Header band
    s.addShape('rect', { x: 0, y: 0, w: W, h: 0.9, fill: { color: OLIVE } });
    s.addShape('rect', { x: 0, y: 0.9, w: W, h: 0.08, fill: { color: GOLD } });
    s.addText(
      ar
        ? `بطاقة مؤشر قياس الأداء التنفيذي | ${c.departmentNameAr || c.departmentName}`
        : `Executive KPI Scorecard | ${c.departmentName}`,
      {
        x: 0.4, y: 0.12, w: W - 0.8, h: 0.65,
        fontSize: 20, bold: true, color: 'FFFFFF',
        align: ar ? 'right' : 'left', rtlMode: ar,
      },
    );

    // Row grid helper: label box (gold) + value box (white/cream).
    // In Arabic the label sits on the RIGHT; in English on the LEFT.
    const rowY = (r: number) => 1.15 + r * 0.72;
    const label = (text: string, y: number, xStartFrac: number, wFrac: number) => {
      const w = W * wFrac;
      const x = ar ? W - W * xStartFrac - w : W * xStartFrac;
      s.addShape('rect', { x, y, w, h: 0.6, fill: { color: GOLD_FILL }, line: { color: GOLD, width: 0.75 } });
      s.addText(text, { x, y, w, h: 0.6, fontSize: 11, bold: true, color: INK, align: 'center', valign: 'middle', rtlMode: ar });
    };
    const value = (text: string, y: number, xStartFrac: number, wFrac: number, opts?: { fill?: string; size?: number }) => {
      const w = W * wFrac;
      const x = ar ? W - W * xStartFrac - w : W * xStartFrac;
      s.addShape('rect', { x, y, w, h: 0.6, fill: { color: opts?.fill ?? 'FFFFFF' }, line: { color: 'BBBBBB', width: 0.75 } });
      s.addText(text || '—', {
        x: x + 0.06, y, w: w - 0.12, h: 0.6,
        fontSize: opts?.size ?? 11, color: INK,
        align: ar ? 'right' : 'left', valign: 'middle', rtlMode: ar, shrinkText: true,
      });
    };

    const gTitle = ar ? c.titleAr || c.title : c.title;
    const gDesc = ar ? c.descriptionAr || c.description : c.description;
    const depGoal = ar ? c.deputyshipGoalTitleAr || c.deputyshipGoalTitle : c.deputyshipGoalTitle;
    const dept = ar ? c.departmentNameAr || c.departmentName : c.departmentName;
    const unit =
      c.targetType === 'percentage' ? (ar ? 'نسبة مئوية' : 'Percentage')
      : c.targetType === 'sar' ? (ar ? 'ريال سعودي' : 'SAR')
      : (ar ? 'عدد' : 'Count');
    const unitFull = c.unitLabel ? `${unit} (${c.unitLabel})` : unit;

    // Row 0: code (empty) | KPI name
    label(ar ? 'رمز المؤشر' : 'KPI code', rowY(0), 0.02, 0.09);
    value('', rowY(0), 0.115, 0.07, { fill: CREAM });
    label(ar ? 'اسم المؤشر التنفيذي' : 'KPI name', rowY(0), 0.19, 0.11);
    value(gTitle, rowY(0), 0.305, 0.33, { fill: CREAM, size: 12 });
    label(ar ? 'الهدف الاستراتيجي المرتبط' : 'Linked strategic goal', rowY(0), 0.645, 0.12);
    value(depGoal, rowY(0), 0.77, 0.21);

    // Row 1: owner | data source (empty)
    label(ar ? 'مالك المؤشر' : 'Owner', rowY(1), 0.02, 0.09);
    value(dept, rowY(1), 0.115, 0.24);
    label(ar ? 'مصدر البيانات' : 'Data source', rowY(1), 0.365, 0.10);
    value('', rowY(1), 0.47, 0.17);
    label(ar ? 'المؤشر الاستراتيجي المرتبط' : 'Strategic indicator', rowY(1), 0.645, 0.12);
    value('', rowY(1), 0.77, 0.21);

    // Row 2: description — full width
    label(ar ? 'وصف المؤشر' : 'Description', rowY(2), 0.02, 0.09);
    value(gDesc, rowY(2), 0.115, 0.865, { size: 10 });

    // Row 3: formula (empty) — full width
    label(ar ? 'معادلة القياس' : 'Formula', rowY(3), 0.02, 0.09);
    value('', rowY(3), 0.115, 0.865);

    // Row 4: baseline/current | unit | frequency | quarterly targets label + Q boxes
    label(ar ? 'القيمة الحالية' : 'Current value', rowY(4), 0.02, 0.09);
    value(String(c.currentValue), rowY(4), 0.115, 0.07, { fill: CREAM });
    label(ar ? 'وحدة القياس' : 'Unit', rowY(4), 0.19, 0.08);
    value(unitFull, rowY(4), 0.275, 0.12);
    label(ar ? 'تكرار القياس' : 'Frequency', rowY(4), 0.40, 0.08);
    value(ar ? 'ربع سنوي' : 'Quarterly', rowY(4), 0.485, 0.10);
    label(ar ? `المستهدفات الربعية ${c.year}` : `Quarterly targets ${c.year}`, rowY(4), 0.59, 0.115);

    // Q1..Q4 boxes
    const qs: [string, number][] = [['Q1', c.q1], ['Q2', c.q2], ['Q3', c.q3], ['Q4', c.q4]];
    qs.forEach(([q, v], i) => {
      const frac = 0.71 + i * 0.072;
      label(q, rowY(4), frac, 0.06);
      const w = W * 0.06;
      const x = ar ? W - W * frac - w : W * frac;
      s.addShape('rect', { x, y: rowY(4) + 0.62, w, h: 0.45, fill: { color: 'FFFFFF' }, line: { color: 'BBBBBB', width: 0.75 } });
      s.addText(String(v), { x, y: rowY(4) + 0.62, w, h: 0.45, fontSize: 12, bold: true, align: 'center', valign: 'middle', color: INK });
    });

    // ---------- linked tasks table
    const tblY = rowY(5) + 0.62;
    const head = ar
      ? [{ text: '%', options: hCell() }, { text: 'الحالة', options: hCell() }, { text: 'المهمة المرتبطة', options: hCell() }, { text: '#', options: hCell() }]
      : [{ text: '#', options: hCell() }, { text: 'Linked task', options: hCell() }, { text: 'Status', options: hCell() }, { text: '%', options: hCell() }];

    const rows = c.tasks.length
      ? c.tasks.map((tk, i) => {
          const cells = ar
            ? [
                { text: tk.completionPct + '%', options: cCell('center') },
                { text: tk.status, options: cCell('center') },
                { text: tk.titleAr || tk.title, options: cCell('right') },
                { text: String(i + 1), options: cCell('center') },
              ]
            : [
                { text: String(i + 1), options: cCell('center') },
                { text: tk.title, options: cCell('left') },
                { text: tk.status, options: cCell('center') },
                { text: tk.completionPct + '%', options: cCell('center') },
              ];
          return cells;
        })
      : [ar
          ? [{ text: '', options: cCell('center') }, { text: '', options: cCell('center') }, { text: 'لا توجد مهام مرتبطة', options: cCell('right') }, { text: '', options: cCell('center') }]
          : [{ text: '', options: cCell('center') }, { text: 'No linked tasks', options: cCell('left') }, { text: '', options: cCell('center') }, { text: '', options: cCell('center') }]];

    const colW = ar ? [1.2, 1.6, 9.3, 0.6] : [0.6, 9.3, 1.6, 1.2];
    s.addTable([head, ...rows], {
      x: 0.27, y: tblY, w: W - 0.54,
      colW,
      fontSize: 10,
      border: { type: 'solid', color: 'BBBBBB', pt: 0.5 },
      valign: 'middle',
      rowH: 0.32,
    });
  }

  const fname = ar ? 'بطاقات-المؤشرات.pptx' : 'kpi-scorecards.pptx';
  await pptx.writeFile({ fileName: fname });
}

function hCell() {
  return { bold: true, fill: { color: 'c9bd93' }, color: '2b2b2b', align: 'center' as const, fontSize: 10 };
}
function cCell(align: 'left' | 'right' | 'center') {
  return { align, color: '2b2b2b', fontSize: 10 };
}
// PptxGenJS is loaded from CDN (browser bundle) because its npm package pulls in
// node:fs / node:https which webpack cannot bundle for the client. Same pattern
// as Chart.js elsewhere in the app.
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
