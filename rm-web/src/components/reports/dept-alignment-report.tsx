'use client';
// REPORT 1 — Department Alignment & Activity, PAGINATED.
//
// Instead of one long div sliced blindly by the PDF exporter, the report is
// packed into explicit A4 pages. Each page gets its own header + footer, and
// long tables split across pages WITH THEIR HEADER ROW REPEATED. A table won't
// leave an orphan stub: if fewer than MIN_ORPHAN_ROWS would remain, the whole
// table moves to the next page.
//
// The exporter captures each .report-page element separately → one PDF page each.
import { useEffect, useRef } from 'react';
import type { DeptAlignmentNamed } from '@/lib/kpi/dashboard-alignment-queries';
import type { DepartmentBurden, ReportChallenge } from '@/lib/reports/queries';

const GREEN = '#199e70';
const ORANGE = '#c2410c';

// A4 at 96dpi, minus margins. Tuned so captured pages map cleanly to PDF pages.
export const PAGE_W = 794;
export const PAGE_H = 1123;
const PAD = 40;
const HEADER_H = 70;
const FOOTER_H = 50;
const CONTENT_H = PAGE_H - PAD * 2 - HEADER_H - FOOTER_H;

// Don't leave fewer than this many rows stranded — push the whole table instead.
const MIN_ORPHAN_ROWS = 5;

// Rough rendered heights (px) used to pack blocks into pages.
const H = { h2: 46, para: 90, stats: 70, chart: 280, tableHeader: 32, tableRow: 30, challengeRow: 34, deptLabel: 28 };

export type ReportSettings = {
  headerText: string;
  headerSize: 14 | 16;
  subHeaderText: string;
  subHeaderSize: 10 | 12;
  footerText: string;
  footerSize: 10 | 12;
  subFooterText: string;
  subFooterSize: 8 | 9;
};

export const DEFAULT_SETTINGS: ReportSettings = {
  headerText: '',
  headerSize: 16,
  subHeaderText: '',
  subHeaderSize: 12,
  footerText: '',
  footerSize: 10,
  subFooterText: '',
  subFooterSize: 8,
};

export type ReportData = {
  overall: { alignmentPct: number; alignedCompleted: number; totalCompleted: number } | null;
  perDept: DeptAlignmentNamed[];
  burden: DepartmentBurden[];
  challenges: ReportChallenge[];
  orgName: string;
  orgNameAr: string;
  periodLabel: string;
  scopeLabel: string;
};

// ---------------------------------------------------------------- block model
// The report is a list of blocks; the packer distributes them across pages.
type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'stats'; items: { label: string; value: string; danger?: boolean }[] }
  | { kind: 'para'; text: string }
  | { kind: 'chart'; id: 'align' | 'burden' }
  | { kind: 'table'; id: string; head: string[]; rows: (string | number)[][]; accent: string }
  | { kind: 'deptLabel'; text: string }
  | { kind: 'challenge'; title: string; pct: number }
  | { kind: 'empty' };

function blockHeight(b: Block): number {
  switch (b.kind) {
    case 'h2': return H.h2;
    case 'stats': return H.stats;
    case 'para': return H.para;
    case 'chart': return H.chart;
    case 'table': return H.tableHeader + b.rows.length * H.tableRow;
    case 'deptLabel': return H.deptLabel;
    case 'challenge': return H.challengeRow;
    case 'empty': return 30;
  }
}

// Pack blocks into pages, splitting tables (repeating their header) and honouring
// the orphan rule.
function paginate(blocks: Block[]): Block[][] {
  const pages: Block[][] = [];
  let page: Block[] = [];
  let used = 0;

  const push = (b: Block, h: number) => { page.push(b); used += h; };
  const newPage = () => { if (page.length) pages.push(page); page = []; used = 0; };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const h = blockHeight(b);
    const remaining = CONTENT_H - used;

    // KEEP-WITH-NEXT: a section heading must never be orphaned at a page foot.
    // If the heading fits but its first content block doesn't, move both over.
    if (b.kind === 'h2' || b.kind === 'deptLabel') {
      const next = blocks[i + 1];
      if (next) {
        const nextH = blockHeight(next);
        // A table can split, so it only needs its header + a few rows to follow.
        const nextMin = next.kind === 'table'
          ? H.tableHeader + MIN_ORPHAN_ROWS * H.tableRow
          : nextH;
        if (h <= remaining && h + nextMin > remaining) {
          newPage();
          push(b, h);
          continue;
        }
      }
    }

    if (h <= remaining) { push(b, h); continue; } 

    // Doesn't fit. Tables can split; everything else moves whole to a new page.
    if (b.kind === 'table') {
      const rowsThatFit = Math.floor((remaining - H.tableHeader) / H.tableRow);
      const rowsLeftOver = b.rows.length - rowsThatFit;
      // Split only if we can place a decent chunk AND won't strand a stub.
      if (rowsThatFit >= MIN_ORPHAN_ROWS && rowsLeftOver >= MIN_ORPHAN_ROWS) {
        push({ ...b, rows: b.rows.slice(0, rowsThatFit) }, H.tableHeader + rowsThatFit * H.tableRow);
        newPage();
        // Continuation keeps the SAME head row — that's the repeated header.
        let rest = b.rows.slice(rowsThatFit);
        while (rest.length > 0) {
          const fit = Math.floor((CONTENT_H - H.tableHeader) / H.tableRow);
          const chunk = rest.slice(0, fit);
          push({ ...b, rows: chunk }, H.tableHeader + chunk.length * H.tableRow);
          rest = rest.slice(fit);
          if (rest.length > 0) newPage();
        }
        continue;
      }
      // Otherwise move the whole table to the next page.
      newPage();
      // If it's taller than a full page even then, split it across pages.
      if (blockHeight(b) > CONTENT_H) {
        let rest = b.rows;
        while (rest.length > 0) {
          const fit = Math.floor((CONTENT_H - H.tableHeader) / H.tableRow);
          const chunk = rest.slice(0, fit);
          push({ ...b, rows: chunk }, H.tableHeader + chunk.length * H.tableRow);
          rest = rest.slice(fit);
          if (rest.length > 0) newPage();
        }
      } else {
        push(b, h);
      }
      continue;
    }

    newPage();
    push(b, h);
  }
  if (page.length) pages.push(page);
  return pages;
}

// ---------------------------------------------------------------- component
export function DeptAlignmentReport({
  data, ar, settings,
}: {
  data: ReportData;
  ar: boolean;
  settings: ReportSettings;
}) {
  const alignChartRef = useRef<HTMLCanvasElement>(null);
  const burdenChartRef = useRef<HTMLCanvasElement>(null);

  // ---- build the block list
  const blocks: Block[] = [];
  const totalOpen = data.burden.reduce((s, b) => s + b.openTasks, 0);
  const totalOverdue = data.burden.reduce((s, b) => s + b.overdueTasks, 0);

  blocks.push({ kind: 'h2', text: ar ? '١. الملخص التنفيذي' : '1. Executive summary' });
  blocks.push({
    kind: 'stats',
    items: [
      { label: ar ? 'المحاذاة الإجمالية' : 'Overall alignment', value: (data.overall?.alignmentPct ?? 0) + '%' },
      { label: ar ? 'المهام المفتوحة' : 'Open tasks', value: String(totalOpen) },
      { label: ar ? 'المهام المتأخرة' : 'Overdue', value: String(totalOverdue), danger: totalOverdue > 0 },
      { label: ar ? 'التحديات النشطة' : 'Active challenges', value: String(data.challenges.length) },
    ],
  });
  blocks.push({
    kind: 'para',
    text: ar
      ? `بلغت نسبة المحاذاة الإجمالية ${data.overall?.alignmentPct ?? 0}% (${data.overall?.alignedCompleted ?? 0} من ${data.overall?.totalCompleted ?? 0} مهمة منجزة مرتبطة بأهداف). يشمل هذا التقرير ${data.burden.length} إدارة، بإجمالي ${totalOpen} مهمة مفتوحة، منها ${totalOverdue} متأخرة.`
      : `Overall alignment stands at ${data.overall?.alignmentPct ?? 0}% (${data.overall?.alignedCompleted ?? 0} of ${data.overall?.totalCompleted ?? 0} completed tasks linked to goals). This report covers ${data.burden.length} department(s), with ${totalOpen} open tasks, of which ${totalOverdue} are overdue.`,
  });

  blocks.push({ kind: 'h2', text: ar ? '٢. المحاذاة حسب الإدارة' : '2. Alignment by department' });
  if (data.perDept.length) {
    blocks.push({ kind: 'chart', id: 'align' });
    blocks.push({
      kind: 'table',
      id: 'align',
      accent: '#f0f7f4',
      head: [ar ? 'الإدارة' : 'Department', ar ? 'المحاذاة' : 'Alignment', ar ? 'مرتبطة / منجزة' : 'Aligned / Completed'],
      rows: data.perDept.map((d) => [
        ar ? d.departmentNameAr || d.departmentName : d.departmentName,
        d.alignmentPct + '%',
        `${d.alignedCompleted} / ${d.totalCompleted}`,
      ]),
    });
  } else blocks.push({ kind: 'empty' });

  blocks.push({ kind: 'h2', text: ar ? '٣. عبء العمل' : '3. Workload / burden' });
  if (data.burden.length) {
    blocks.push({ kind: 'chart', id: 'burden' });
    blocks.push({
      kind: 'table',
      id: 'burden',
      accent: '#fdf3ef',
      head: [
        ar ? 'الإدارة' : 'Department',
        ar ? 'مفتوحة' : 'Open',
        ar ? 'متأخرة' : 'Overdue',
        ar ? 'الأعضاء' : 'Members',
        ar ? 'مهام / فرد' : 'Per member',
      ],
      rows: data.burden.map((b) => [
        ar ? b.departmentNameAr || b.departmentName : b.departmentName,
        b.openTasks,
        b.overdueTasks,
        b.memberCount,
        b.openPerMember,
      ]),
    });
  } else blocks.push({ kind: 'empty' });

  blocks.push({ kind: 'h2', text: ar ? '٤. التحديات' : '4. Challenges' });
  if (data.challenges.length) {
    const byDept = new Map<string, ReportChallenge[]>();
    for (const c of data.challenges) {
      const key = (ar ? c.departmentNameAr || c.departmentName : c.departmentName) || (ar ? 'غير مُسند' : 'Unassigned');
      if (!byDept.has(key)) byDept.set(key, []);
      byDept.get(key)!.push(c);
    }
    for (const [dept, list] of byDept) {
      blocks.push({ kind: 'deptLabel', text: dept });
      for (const c of list) {
        blocks.push({ kind: 'challenge', title: ar ? c.titleAr || c.title : c.title, pct: c.completionPercentage });
      }
    }
  } else blocks.push({ kind: 'empty' });

  const pages = paginate(blocks);

  // ---- charts (drawn after the pages exist so the canvases are mounted)
  useEffect(() => {
    const w = window as unknown as { Chart?: any };
    const draw = () => {
      if (!w.Chart) return;
      const specs: [HTMLCanvasElement | null, string[], number[], string][] = [
        [
          alignChartRef.current,
          data.perDept.map((d) => (ar ? d.departmentNameAr || d.departmentName : d.departmentName)),
          data.perDept.map((d) => d.alignmentPct),
          GREEN,
        ],
        [
          burdenChartRef.current,
          data.burden.map((b) => (ar ? b.departmentNameAr || b.departmentName : b.departmentName)),
          data.burden.map((b) => b.openPerMember),
          ORANGE,
        ],
      ];
      for (const [canvas, labels, values, color] of specs) {
        if (!canvas) continue;
        const prev = (canvas as any)._chart;
        if (prev) prev.destroy();
        (canvas as any)._chart = new w.Chart(canvas, {
          type: 'bar',
          data: { labels, datasets: [{ data: values, backgroundColor: color }] },
          options: {
            responsive: false, animation: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } },
          },
        });
      }
    };
    if (w.Chart) draw();
    else {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.onload = draw;
      document.head.appendChild(s);
    }
  }, [data, ar, pages.length]);

  const total = pages.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {pages.map((pageBlocks, i) => (
        <div
          key={i}
          className="report-page"
          dir={ar ? 'rtl' : 'ltr'}
          style={{
            width: PAGE_W,
            height: PAGE_H,
            background: '#fff',
            padding: PAD,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: ar ? "'Segoe UI', Tahoma, Arial, sans-serif" : 'system-ui, -apple-system, sans-serif',
            color: '#1a1a1a',
          }}
        >
          {/* ---- page header (every page) ---- */}
          <div style={{ height: HEADER_H, borderBottom: `2px solid ${GREEN}`, paddingBottom: 8, marginBottom: 14, flexShrink: 0 }}>
            {settings.headerText ? (
              <div style={{ fontSize: settings.headerSize, fontWeight: 700 }}>{settings.headerText}</div>
            ) : (
              <div style={{ fontSize: settings.headerSize, fontWeight: 700 }}>
                {ar ? 'تقرير محاذاة الإدارات والنشاط' : 'Department Alignment & Activity Report'}
              </div>
            )}
            {settings.subHeaderText ? (
              <div style={{ fontSize: settings.subHeaderSize, color: '#666', marginTop: 3 }}>{settings.subHeaderText}</div>
            ) : (
              <div style={{ fontSize: settings.subHeaderSize, color: '#666', marginTop: 3 }}>
                {ar ? data.orgNameAr || data.orgName : data.orgName}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#999', marginTop: 3 }}>
              {(ar ? 'النطاق: ' : 'Scope: ') + data.scopeLabel} · {(ar ? 'الفترة: ' : 'Period: ') + data.periodLabel}
            </div>
          </div>

          {/* ---- page content ---- */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {pageBlocks.map((b, j) => (
              <BlockView
                key={j}
                b={b}
                ar={ar}
                alignRef={b.kind === 'chart' && b.id === 'align' ? alignChartRef : undefined}
                burdenRef={b.kind === 'chart' && b.id === 'burden' ? burdenChartRef : undefined}
              />
            ))}
          </div>

          {/* ---- page footer (every page) ---- */}
          <div
            style={{
              height: FOOTER_H,
              borderTop: '1px solid #e5e5e5',
              paddingTop: 8,
              flexShrink: 0,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              alignItems: 'center',
            }}
          >
            {/* Page number: START side = right in RTL, left in LTR (dir handles it) */}
            <div style={{ fontSize: settings.footerSize, color: '#777', fontWeight: 400, textAlign: 'start' }}>
              {ar ? `صفحة ${i + 1} من ${total}` : `Page ${i + 1} of ${total}`}
            </div>
            <div style={{ textAlign: 'center' }}>
              {settings.footerText && (
                <div style={{ fontSize: settings.footerSize, color: '#555' }}>{settings.footerText}</div>
              )}
              {settings.subFooterText && (
                <div style={{ fontSize: settings.subFooterSize, color: '#999', marginTop: 2 }}>{settings.subFooterText}</div>
              )}
            </div>
            <div />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- block render
function BlockView({
  b, ar, alignRef, burdenRef,
}: {
  b: Block;
  ar: boolean;
  alignRef?: React.RefObject<HTMLCanvasElement | null>;
  burdenRef?: React.RefObject<HTMLCanvasElement | null>;
}) {
  switch (b.kind) {
    case 'h2':
      return <h2 style={{ fontSize: 15, fontWeight: 700, color: GREEN, marginTop: 16, marginBottom: 10 }}>{b.text}</h2>;

    case 'stats':
      return (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          {b.items.map((s, i) => (
            <div key={i} style={{ flex: 1, border: '1px solid #e5e5e5', borderRadius: 8, padding: '9px 11px' }}>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 19, fontWeight: 700, color: s.danger ? ORANGE : '#1a1a1a' }}>{s.value}</div>
            </div>
          ))}
        </div>
      );

    case 'para':
      return <p style={{ fontSize: 12.5, lineHeight: 1.9, color: '#444', margin: '0 0 10px' }}>{b.text}</p>;

    case 'chart':
      return (
        <canvas
          ref={b.id === 'align' ? alignRef : burdenRef}
          width={700}
          height={250}
          style={{ marginBottom: 12, maxWidth: '100%' }}
        />
      );

    case 'table':
      return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr style={{ background: b.accent }}>
              {b.head.map((h, i) => (
                <th key={i} style={{ padding: '7px 10px', border: '1px solid #e0e0e0', fontWeight: 600, textAlign: 'start' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} style={{ padding: '7px 10px', border: '1px solid #e8e8e8', textAlign: 'start' }}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'deptLabel':
      return <div style={{ fontSize: 13, fontWeight: 600, margin: '10px 0 7px', color: '#333' }}>{b.text}</div>;

    case 'challenge':
      return (
        <div style={{ marginBottom: 9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span>{b.title}</span>
            <span style={{ fontWeight: 600, color: GREEN, marginInlineStart: 10 }}>{b.pct}%</span>
          </div>
          <div style={{ height: 7, background: '#e8e8e8', borderRadius: 4 }}>
            <div style={{ width: b.pct + '%', height: '100%', background: GREEN, borderRadius: 4 }} />
          </div>
        </div>
      );

    case 'empty':
      return <p style={{ fontSize: 12, color: '#999', margin: 0 }}>{ar ? 'لا توجد بيانات.' : 'No data.'}</p>;
  }
}
