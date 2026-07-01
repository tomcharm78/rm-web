'use client';

import { type PerfTier, tierLabel, tierColor } from '@/lib/dashboard/scoring';

// A semicircular gauge. score 0-100 positions the needle; tier colors the arc.
export function PerfGauge({ score, tier, label, ar, size = 200 }: {
  score: number; tier: PerfTier; label: string; ar: boolean; size?: number;
}) {
  const w = size;
  const h = size * 0.62;
  const cx = w / 2;
  const cy = h * 0.92;
  const r = w * 0.42;

  // needle angle: 0 score = 180deg (left), 100 = 0deg (right)
  const angle = 180 - (Math.max(0, Math.min(100, score)) / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const nx = cx + Math.cos(rad) * (r - 6);
  const ny = cy - Math.sin(rad) * (r - 6);

  // arc fill up to score
  const arcLen = Math.PI * r;
  const filled = (score / 100) * arcLen;
  const color = tierColor(tier);

  const startX = cx - r, startY = cy;
  const endX = cx + r, endY = cy;

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={w} height={h + 4} viewBox={`0 0 ${w} ${h + 4}`} role="img" aria-label={`${label}: ${tierLabel(tier, ar)}`}>
        <path d={`M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`} fill="none" stroke="var(--surface-0, #eee)" strokeWidth="14" strokeLinecap="round" />
        <path d={`M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${filled} ${arcLen}`} />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text-primary, #333)" strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="var(--text-primary, #333)" />
        <text x={cx} y={cy - r * 0.35} textAnchor="middle" fontSize={w * 0.11} fontWeight="500" fill="var(--text-primary, #333)">
          {tierLabel(tier, ar)}
        </text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted, #999)', padding: '0 6px', marginTop: -4 }}>
        <span>{ar ? 'منخفض' : 'Low'}</span>
        <span>{ar ? 'متوسط' : 'Med'}</span>
        <span>{ar ? 'مرتفع' : 'High'}</span>
        <span>{ar ? 'متميّز' : 'Super'}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary, #666)', marginTop: 4 }}>{label}</div>
    </div>
  );
}
