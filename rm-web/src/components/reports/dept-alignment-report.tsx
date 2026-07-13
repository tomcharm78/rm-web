'use client';
// REPORT 1 — Department Alignment & Activity, with MEASURED pagination.
//
// Two-pass render:
//   PASS 1 — every block is rendered into a hidden container and its real
//            offsetHeight measured. No guessing.
//   PASS 2 — blocks are packed into A4 pages using those true heights, then the
//            pages render for real (and for html2canvas capture).
//
// Rules honoured while packing:
//   • header + footer reserved on EVERY page
//   • tables split across pages WITH their header row repeated
//   • never strand fewer than MIN_ORPHAN_ROWS rows (push whole table instead)
//   • keep-with-next: a section heading is never orphaned at a page foot
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DeptAlignmentNamed } from '@/lib/kpi/dashboard-alignment-queries';
import type { DepartmentBurden, ReportChallenge } from '@/lib/reports/queries';

const GREEN = '#199e70';
const ORANGE = '#c2410c';

export const PAGE_W = 794;   // A4 @96dpi
export const PAGE_H = 1123;
const PAD = 40;
const HEADER_H = 74;
const FOOTER_H = 52;
// A few px of slack so a marginally-taller render never clips.
const SAFETY = 12;
const CONTENT_H = PAGE_H - PAD * 2 - HEADER_H - FOOTER_H - SAFETY;

const MIN_ORPHAN_ROWS = 5;

export type ReportSettings = {
  headerText: string; headerSize: 14 | 16;
  subHeaderText: string; subHeaderSize: 10 | 12;
  footerText: string; footerSize: 10 | 12;
  subFooterText: string; subFooterSize: 8 | 9;
};
export const DEFAULT_SETTINGS: ReportSettings = {
  headerText: '', headerSize: 16,
  subHeaderText: '', subHeaderSize: 12,
  footerText: '', footerSize: 10,
  subFooterText: '', subFooterSize: 8,
};

export type ReportData = {
  overall: { alignmentPct: number; alignedCompleted: number; totalCompleted: number } | null;
  perDept: DeptAlignmentNamed[];
  burden: DepartmentBurden[];
  challenges: ReportChallenge[];
  orgName: string; orgNameAr: string;
  periodLabel: string; scopeLabel: string;
};

type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'stats'; items: { label: string; value: string; danger?: boolean }[] }
  | { kind: 'para'; text: string }
  | { kind: 'chart'; id: 'align' | 'burden'; h?: number }
  | { kind: 'table'; id: string; head: string[]; rows: (string | number)[][]; accent: string }
  | { kind: 'deptLabel'; text: string }
  | { kind: 'challenge'; title: string; pct: number }
  | { kind: 'empty' };

// ---------------------------------------------------------------- build blocks
function buildBlocks(data: ReportData, ar: boolean): Block[] {
  const blocks: Block[] = [];
  const totalOpen = data.burden.reduce((s, b) => s + b.openTasks, 0);
  const totalOverdue = data.burden.reduce((s, b) => s + b.overdueTasks, 0);

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
  } else blocks.push({ kind: 'empty' });

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
      for (const c of list) blocks.push({ kind: 'challenge', title: ar ? c.titleAr || c.title : c.title, pct: c.completionPercentage });
    }
  } else blocks.push({ kind: 'empty' });

  return blocks;
}

// ---------------------------------------------------------------- pack pages
// `heights` are the MEASURED heights, parallel to `blocks`.
// For tables we also need the measured header-row height and row height.
type TableMetrics = { headH: number; rowH: number };

function paginate(
  blocks: Block[],
  heights: number[],
  tableMetrics: Map<string, TableMetrics>,
): Block[][] {
  const pages: Block[][] = [];
  let page: Block[] = [];
  let used = 0;

  const push = (b: Block, h: number) => { page.push(b); used += h; };
  const newPage = () => { if (page.length) pages.push(page); page = []; used = 0; };
  const tableH = (b: Extract<Block, { kind: 'table' }>, rows: number) => {
    const m = tableMetrics.get(b.id) ?? { headH: 34, rowH: 30 };
    return m.headH + rows * m.rowH;
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const h = heights[i] ?? 0;
    const remaining = CONTENT_H - used;

    // keep-with-next: never orphan a heading at a page foot.
    if (b.kind === 'h2' || b.kind === 'deptLabel') {
      const next = blocks[i + 1];
      if (next) {
        const nextMin = next.kind === 'table'
          ? tableH(next, MIN_ORPHAN_ROWS)
          : next.kind === 'chart'
          ? ((heights[i + 1] ?? 262) - 250) + 170   // chart chrome + minimum canvas height
          : (heights[i + 1] ?? 0);
        if (h <= remaining && h + nextMin > remaining) {
          newPage();
          push(b, h);
          continue;
        }
      }
    }

    if (h <= remaining) { push(b, h); continue; }

    // A chart is one indivisible block. Rather than push it to the next page and
    // leave a gap, shrink it to fit — down to a sensible floor.
    if (b.kind === 'chart') {
      const MIN_CHART_H = 170;   // below this it stops being readable
      const chrome = h - 250;    // measured height minus the canvas box = margins
      const availableForCanvas = remaining - chrome;
      if (availableForCanvas >= MIN_CHART_H) {
        push({ ...b, h: Math.floor(availableForCanvas) }, remaining);
        continue;
      }
      // Too tight even shrunk — move it to the next page at full size.
      newPage();
      push(b, h);
      continue;
    }

    if (b.kind === 'table') {
      const m = tableMetrics.get(b.id) ?? { headH: 34, rowH: 30 };
      const fitHere = Math.floor((remaining - m.headH) / m.rowH);
      const leftOver = b.rows.length - fitHere;

      if (fitHere >= MIN_ORPHAN_ROWS && leftOver >= MIN_ORPHAN_ROWS) {
        push({ ...b, rows: b.rows.slice(0, fitHere) }, tableH(b, fitHere));
        newPage();
        let rest = b.rows.slice(fitHere);
        while (rest.length) {
          const fit = Math.max(1, Math.floor((CONTENT_H - m.headH) / m.rowH));
          const chunk = rest.slice(0, fit);
          push({ ...b, rows: chunk }, tableH(b, chunk.length)); // head repeats
          rest = rest.slice(fit);
          if (rest.length) newPage();
        }
        continue;
      }

      newPage();
      if (tableH(b, b.rows.length) > CONTENT_H) {
        let rest = b.rows;
        while (rest.length) {
          const fit = Math.max(1, Math.floor((CONTENT_H - m.headH) / m.rowH));
          const chunk = rest.slice(0, fit);
          push({ ...b, rows: chunk }, tableH(b, chunk.length));
          rest = rest.slice(fit);
          if (rest.length) newPage();
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
}: { data: ReportData; ar: boolean; settings: ReportSettings }) {
  const measureRef = useRef<HTMLDivElement>(null);
  const alignChartRef = useRef<HTMLCanvasElement>(null);
  const burdenChartRef = useRef<HTMLCanvasElement>(null);

  const blocks = buildBlocks(data, ar);
  const [pages, setPages] = useState<Block[][] | null>(null);

  // PASS 1 — measure every block for real, then pack.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll<HTMLElement>('[data-block]'));
    if (nodes.length !== blocks.length) return;

    // Include vertical margins — getBoundingClientRect() excludes them, which
    // under-measures every block and overflows the page.
    // Wrappers use display:flow-root, so margins do NOT collapse out — the
    // wrapper height already includes them. Measure plainly; no double-counting.
    const heights = nodes.map((n) => n.getBoundingClientRect().height);

    // Measure real table header + row heights so splits are exact.
    const tableMetrics = new Map<string, TableMetrics>();
    nodes.forEach((n, i) => {
      const b = blocks[i];
      if (b.kind !== 'table') return;
      const thead = n.querySelector('thead');
      const firstRow = n.querySelector('tbody tr');
      tableMetrics.set(b.id, {
        headH: thead?.getBoundingClientRect().height ?? 34,
        rowH: firstRow?.getBoundingClientRect().height ?? 30,
      });
    });

    setPages(paginate(blocks, heights, tableMetrics));
    // Re-measure whenever the content or language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data), ar, settings.headerSize, settings.subHeaderSize]);

  // Charts — drawn once the real pages are mounted.
  useEffect(() => {
    if (!pages) return;
    const w = window as unknown as { Chart?: any };
    const draw = () => {
      if (!w.Chart) return;
      const specs: [HTMLCanvasElement | null, string[], number[], string][] = [
        [alignChartRef.current,
          data.perDept.map((d) => (ar ? d.departmentNameAr || d.departmentName : d.departmentName)),
          data.perDept.map((d) => d.alignmentPct), GREEN],
        [burdenChartRef.current,
          data.burden.map((b) => (ar ? b.departmentNameAr || b.departmentName : b.departmentName)),
          data.burden.map((b) => b.openPerMember), ORANGE],
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
  }, [pages, data, ar]);

  const total = pages?.length ?? 0;

  return (
    <>
      {/* ---- hidden measuring pass (same width + styles as a real page) ---- */}
      <div
        ref={measureRef}
        aria-hidden
        dir={ar ? 'rtl' : 'ltr'}
        style={{
          position: 'absolute', visibility: 'hidden', pointerEvents: 'none',
          top: -99999, insetInlineStart: -99999,
          width: PAGE_W - PAD * 2,
          fontFamily: ar ? "'Segoe UI', Tahoma, Arial, sans-serif" : 'system-ui, -apple-system, sans-serif',
        }}
      >
        {blocks.map((b, i) => (
          <div key={i} data-block style={{ display: 'flow-root' }}>
            <BlockView b={b} ar={ar} measuring />
          </div>
        ))}
      </div>

      {/* ---- real pages ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {(pages ?? []).map((pageBlocks, i) => (
          <div
            key={i}
            className="report-page"
            dir={ar ? 'rtl' : 'ltr'}
            style={{
              width: PAGE_W, height: PAGE_H, background: '#fff', padding: PAD,
              boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
              fontFamily: ar ? "'Segoe UI', Tahoma, Arial, sans-serif" : 'system-ui, -apple-system, sans-serif',
              color: '#1a1a1a',
            }}
          >
            {/* header — every page */}
            <div style={{ height: HEADER_H, borderBottom: `2px solid ${GREEN}`, paddingBottom: 8, marginBottom: 14, flexShrink: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: settings.headerSize, fontWeight: 700 }}>
                {settings.headerText || (ar ? 'تقرير محاذاة الإدارات والنشاط' : 'Department Alignment & Activity Report')}
              </div>
              <div style={{ fontSize: settings.subHeaderSize, color: '#666', marginTop: 3 }}>
                {settings.subHeaderText || (ar ? data.orgNameAr || data.orgName : data.orgName)}
              </div>
              <div style={{ fontSize: 10, color: '#999', marginTop: 3 }}>
                {(ar ? 'النطاق: ' : 'Scope: ') + data.scopeLabel} · {(ar ? 'الفترة: ' : 'Period: ') + data.periodLabel}
              </div>
            </div>

            {/* content */}
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

            {/* footer — every page. Page number sits on the START side:
                right in RTL, left in LTR (dir does the work). */}
            <div style={{
              height: FOOTER_H, borderTop: '1px solid #e5e5e5', paddingTop: 8, flexShrink: 0,
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center',
            }}>
              <div style={{ fontSize: settings.footerSize, color: '#777', fontWeight: 400, textAlign: 'start' }}>
                {ar ? `صفحة ${i + 1} من ${total}` : `Page ${i + 1} of ${total}`}
              </div>
              <div style={{ textAlign: 'center' }}>
                {settings.footerText && <div style={{ fontSize: settings.footerSize, color: '#555' }}>{settings.footerText}</div>}
                {settings.subFooterText && <div style={{ fontSize: settings.subFooterSize, color: '#999', marginTop: 2 }}>{settings.subFooterText}</div>}
              </div>
              <div />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- block render
function BlockView({
  b, ar, alignRef, burdenRef, measuring,
}: {
  b: Block; ar: boolean;
  alignRef?: React.RefObject<HTMLCanvasElement | null>;
  burdenRef?: React.RefObject<HTMLCanvasElement | null>;
  measuring?: boolean;
}) {
  switch (b.kind) {
    case 'h2':
      return <h2 style={{ fontSize: 15, fontWeight: 700, color: GREEN, margin: '16px 0 10px' }}>{b.text}</h2>;

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

    case 'chart': {
      const ch = b.h ?? 250;
      return (
        <canvas
          ref={measuring ? undefined : (b.id === 'align' ? alignRef : burdenRef)}
          width={700}
          height={ch}
          style={{ marginBottom: 12, width: '100%', height: ch }}
        />
      );
    }

    case 'table':
      return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr style={{ background: b.accent }}>
              {b.head.map((h, i) => (
                <th key={i} style={{ padding: '7px 10px', border: '1px solid #e0e0e0', fontWeight: 600, textAlign: 'start' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} style={{ padding: '7px 10px', border: '1px solid #e8e8e8', textAlign: 'start' }}>{c}</td>
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
