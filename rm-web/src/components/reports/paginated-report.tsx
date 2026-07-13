'use client';
// SHARED REPORT ENGINE.
//
// Every report supplies a list of BLOCKS; this engine does the rest:
//   PASS 1 — render blocks hidden, measure their REAL heights (no guessing)
//   PASS 2 — pack them into A4 pages and render, with header + footer on every page
//
// Rules it enforces:
//   • tables split across pages WITH their header row repeated
//   • never strand fewer than MIN_ORPHAN_ROWS rows (move the whole table instead)
//   • keep-with-next: a section heading is never orphaned at a page foot
//   • a chart that nearly fits SHRINKS to fill the page rather than leaving a gap
//
// The exporter captures each .report-page element separately → one PDF page each.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export const PAGE_W = 794;   // A4 @96dpi
export const PAGE_H = 1123;
const PAD = 40;
const HEADER_H = 74;
const FOOTER_H = 52;
const SAFETY = 12;
export const CONTENT_H = PAGE_H - PAD * 2 - HEADER_H - FOOTER_H - SAFETY;

const MIN_ORPHAN_ROWS = 5;
const CHART_FULL_H = 250;
const CHART_MIN_H = 170;

export const GREEN = '#199e70';
export const ORANGE = '#c2410c';

// ---------------------------------------------------------------- settings
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

// ---------------------------------------------------------------- blocks
export type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'stats'; items: { label: string; value: string; danger?: boolean }[] }
  | { kind: 'para'; text: string }
  | { kind: 'chart'; id: string; h?: number }
  | { kind: 'table'; id: string; head: string[]; rows: (string | number)[][]; accent: string }
  | { kind: 'label'; text: string }
  | { kind: 'bar'; title: string; pct: number; sub?: string }
  | { kind: 'note'; text: string; danger?: boolean }
  | { kind: 'empty'; text: string };

type TableMetrics = { headH: number; rowH: number };

// ---------------------------------------------------------------- packing
function paginate(blocks: Block[], heights: number[], tm: Map<string, TableMetrics>): Block[][] {
  const pages: Block[][] = [];
  let page: Block[] = [];
  let used = 0;

  const push = (b: Block, h: number) => { page.push(b); used += h; };
  const newPage = () => { if (page.length) pages.push(page); page = []; used = 0; };
  const tableH = (b: Extract<Block, { kind: 'table' }>, rows: number) => {
    const m = tm.get(b.id) ?? { headH: 34, rowH: 30 };
    return m.headH + rows * m.rowH;
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const h = heights[i] ?? 0;
    const remaining = CONTENT_H - used;

    // keep-with-next — a heading must not be stranded at a page foot.
    if (b.kind === 'h2' || b.kind === 'label') {
      const next = blocks[i + 1];
      if (next) {
        const nextMin =
          next.kind === 'table' ? tableH(next, MIN_ORPHAN_ROWS)
          : next.kind === 'chart' ? ((heights[i + 1] ?? CHART_FULL_H + 12) - CHART_FULL_H) + CHART_MIN_H
          : (heights[i + 1] ?? 0);
        if (h <= remaining && h + nextMin > remaining) {
          newPage();
          push(b, h);
          continue;
        }
      }
    }

    if (h <= remaining) { push(b, h); continue; }

    // A chart is indivisible — shrink it to fill rather than leave a gap.
    if (b.kind === 'chart') {
      const chrome = h - CHART_FULL_H;
      const room = remaining - chrome;
      if (room >= CHART_MIN_H) {
        push({ ...b, h: Math.floor(room) }, remaining);
        continue;
      }
      newPage();
      push(b, h);
      continue;
    }

    // Tables split, repeating their header.
    if (b.kind === 'table') {
      const m = tm.get(b.id) ?? { headH: 34, rowH: 30 };
      const fitHere = Math.floor((remaining - m.headH) / m.rowH);
      const leftOver = b.rows.length - fitHere;

      if (fitHere >= MIN_ORPHAN_ROWS && leftOver >= MIN_ORPHAN_ROWS) {
        push({ ...b, rows: b.rows.slice(0, fitHere) }, tableH(b, fitHere));
        newPage();
        let rest = b.rows.slice(fitHere);
        while (rest.length) {
          const fit = Math.max(1, Math.floor((CONTENT_H - m.headH) / m.rowH));
          const chunk = rest.slice(0, fit);
          push({ ...b, rows: chunk }, tableH(b, chunk.length));
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

// ---------------------------------------------------------------- engine
export type ChartSpec = {
  id: string;
  labels: string[];
  values: number[];
  color: string;
  type?: 'bar' | 'line';
};

export function PaginatedReport({
  blocks, charts, ar, settings, title, subtitle, meta,
}: {
  blocks: Block[];
  charts: ChartSpec[];
  ar: boolean;
  settings: ReportSettings;
  title: string;       // fallback header if the user hasn't set one
  subtitle: string;    // fallback sub-header
  meta: string;        // scope · period line
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const [pages, setPages] = useState<Block[][] | null>(null);

  // PASS 1 — measure for real.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll<HTMLElement>('[data-block]'));
    if (nodes.length !== blocks.length) return;

    // Wrappers are display:flow-root, so margins are inside the measured box.
    const heights = nodes.map((n) => n.getBoundingClientRect().height);

    const tm = new Map<string, TableMetrics>();
    nodes.forEach((n, i) => {
      const b = blocks[i];
      if (b.kind !== 'table') return;
      const thead = n.querySelector('thead');
      const row = n.querySelector('tbody tr');
      tm.set(b.id, {
        headH: thead?.getBoundingClientRect().height ?? 34,
        rowH: row?.getBoundingClientRect().height ?? 30,
      });
    });

    setPages(paginate(blocks, heights, tm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(blocks), ar, settings.headerSize, settings.subHeaderSize]);

  // Charts — drawn once the real pages are mounted.
  useEffect(() => {
    if (!pages) return;
    const w = window as unknown as { Chart?: any };
    const draw = () => {
      if (!w.Chart) return;
      for (const spec of charts) {
        const canvas = canvasRefs.current.get(spec.id);
        if (!canvas) continue;
        const prev = (canvas as any)._chart;
        if (prev) prev.destroy();
        (canvas as any)._chart = new w.Chart(canvas, {
          type: spec.type ?? 'bar',
          data: {
            labels: spec.labels,
            datasets: [{
              data: spec.values,
              backgroundColor: spec.color,
              borderColor: spec.color,
              fill: false,
            }],
          },
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
  }, [pages, charts]);

  const total = pages?.length ?? 0;

  return (
    <>
      {/* hidden measuring pass */}
      <div
        ref={measureRef}
        aria-hidden
        dir={ar ? 'rtl' : 'ltr'}
        style={{
          position: 'absolute', visibility: 'hidden', pointerEvents: 'none',
          top: -99999, insetInlineStart: -99999,
          width: PAGE_W - PAD * 2,
          fontFamily: fontFor(ar),
        }}
      >
        {blocks.map((b, i) => (
          <div key={i} data-block style={{ display: 'flow-root' }}>
            <BlockView b={b} ar={ar} />
          </div>
        ))}
      </div>

      {/* real pages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {(pages ?? []).map((pageBlocks, i) => (
          <div
            key={i}
            className="report-page"
            dir={ar ? 'rtl' : 'ltr'}
            style={{
              width: PAGE_W, height: PAGE_H, background: '#fff', padding: PAD,
              boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
              fontFamily: fontFor(ar), color: '#1a1a1a',
            }}
          >
            <div style={{ height: HEADER_H, borderBottom: `2px solid ${GREEN}`, paddingBottom: 8, marginBottom: 14, flexShrink: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: settings.headerSize, fontWeight: 700 }}>
                {settings.headerText || title}
              </div>
              <div style={{ fontSize: settings.subHeaderSize, color: '#666', marginTop: 3 }}>
                {settings.subHeaderText || subtitle}
              </div>
              <div style={{ fontSize: 10, color: '#999', marginTop: 3 }}>{meta}</div>
            </div>

            <div style={{ flex: 1, overflow: 'hidden' }}>
              {pageBlocks.map((b, j) => (
                <BlockView
                  key={j}
                  b={b}
                  ar={ar}
                  setCanvas={(el) => { if (b.kind === 'chart' && el) canvasRefs.current.set(b.id, el); }}
                />
              ))}
            </div>

            {/* footer — page number on the START side (right in RTL, left in LTR) */}
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

function fontFor(ar: boolean) {
  return ar ? "'Segoe UI', Tahoma, Arial, sans-serif" : 'system-ui, -apple-system, sans-serif';
}

// ---------------------------------------------------------------- block render
function BlockView({
  b, ar, setCanvas,
}: {
  b: Block;
  ar: boolean;
  setCanvas?: (el: HTMLCanvasElement | null) => void;
}) {
  switch (b.kind) {
    case 'h2':
      return <h2 style={{ fontSize: 15, fontWeight: 700, color: GREEN, margin: '16px 0 10px' }}>{b.text}</h2>;

    case 'label':
      return <div style={{ fontSize: 13, fontWeight: 600, margin: '10px 0 7px', color: '#333' }}>{b.text}</div>;

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

    case 'note':
      return (
        <p style={{
          fontSize: 12, lineHeight: 1.7, margin: '0 0 10px',
          color: b.danger ? ORANGE : '#666',
          background: b.danger ? '#fdf3ef' : '#f7f7f7',
          padding: '8px 10px', borderRadius: 6,
        }}>
          {b.text}
        </p>
      );

    case 'chart': {
      const h = b.h ?? CHART_FULL_H;
      return (
        <canvas
          ref={setCanvas}
          width={700}
          height={h}
          style={{ marginBottom: 12, width: '100%', height: h }}
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

    case 'bar':
      return (
        <div style={{ marginBottom: 9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span>{b.title}{b.sub ? <span style={{ color: '#999', marginInlineStart: 6 }}>{b.sub}</span> : null}</span>
            <span style={{ fontWeight: 600, color: GREEN, marginInlineStart: 10 }}>{b.pct}%</span>
          </div>
          <div style={{ height: 7, background: '#e8e8e8', borderRadius: 4 }}>
            <div style={{ width: b.pct + '%', height: '100%', background: GREEN, borderRadius: 4 }} />
          </div>
        </div>
      );

    case 'empty':
      return <p style={{ fontSize: 12, color: '#999', margin: 0 }}>{b.text}</p>;
  }
}
