'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ExternalLink, CheckSquare, Trophy } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { getLinkageOverview } from '@/lib/kpi/linkage-queries';

type Filter = 'all' | 'unlinked' | 'linked';

export function LinkageOverview({ scopeDeptId, deptNameById, ar: arProp }: {
  scopeDeptId: string | null;
  deptNameById?: Map<string, string>;
  ar?: boolean;
}) {
  const { language } = useLanguage();
  const ar = arProp ?? language === 'ar';
  const [filter, setFilter] = useState<Filter>('all');

  const q = useQuery({ queryKey: ['linkage-overview', scopeDeptId], queryFn: () => getLinkageOverview(scopeDeptId) });
  const all = q.data ?? [];

  const rows = all.filter((r) => filter === 'all' ? true : filter === 'linked' ? r.linked : !r.linked);

  const linkedCount = all.filter((r) => r.linked).length;
  const unlinkedCount = all.length - linkedCount;

  return (
    <div style={{ marginTop: 28, borderLeft: '3px solid #64748b', paddingLeft: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{ar ? 'نظرة عامة على الربط' : 'Linkage overview'}</div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
            {ar ? 'المهام والتحديات المرتبطة وغير المرتبطة بالأهداف' : 'tasks & challenges linked / not linked to goals'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'unlinked', 'linked'] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                fontSize: 12, padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
                border: '0.5px solid hsl(var(--border))',
                background: filter === f ? 'hsl(var(--foreground))' : 'transparent',
                color: filter === f ? 'hsl(var(--background))' : 'hsl(var(--foreground))',
              }}>
              {f === 'all' ? (ar ? 'الكل' : 'All') : f === 'unlinked' ? `${ar ? 'غير مرتبط' : 'Unlinked'} (${unlinkedCount})` : `${ar ? 'مرتبط' : 'Linked'} (${linkedCount})`}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '12px 0' }}>{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '12px 0' }}>{ar ? 'لا توجد عناصر.' : 'Nothing to show.'}</p>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11, textAlign: 'start' }}>
                <th style={th}>#</th>
                <th style={th}>{ar ? 'العنوان' : 'Title'}</th>
                {!scopeDeptId && <th style={th}>{ar ? 'القسم' : 'Department'}</th>}
                <th style={{ ...th, textAlign: 'center' }}>{ar ? 'مرتبط' : 'Linked'}</th>
                <th style={th}>{ar ? 'الهدف' : 'Goal'}</th>
                <th style={{ ...th, textAlign: 'center' }}>{ar ? 'الحالة' : 'Status'}</th>
                <th style={{ ...th, textAlign: 'center' }}>{ar ? 'فتح' : 'Open'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.kind}-${r.id}`} style={{ borderTop: '0.5px solid hsl(var(--border))' }}>
                  <td style={{ ...td, color: 'hsl(var(--muted-foreground))' }}>{i + 1}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.kind === 'task' ? <CheckSquare size={13} style={{ color: '#2a78d6', flexShrink: 0 }} /> : <Trophy size={13} style={{ color: '#c98500', flexShrink: 0 }} />}
                      <span style={{ fontWeight: 500 }}>{ar ? r.titleAr || r.title : r.title}</span>
                    </div>
                  </td>
                  {!scopeDeptId && <td style={{ ...td, color: 'hsl(var(--muted-foreground))' }}>{r.departmentId ? (deptNameById?.get(r.departmentId) ?? '—') : '—'}</td>}
                  <td style={{ ...td, textAlign: 'center' }}>
                    {r.linked
                      ? <span style={{ color: '#199e70', fontWeight: 600 }}>{ar ? 'نعم' : 'Yes'}</span>
                      : <span style={{ color: '#e34948', fontWeight: 600 }}>{ar ? 'لا' : 'No'}</span>}
                  </td>
                  <td style={{ ...td, color: r.linked ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))', maxWidth: 220 }}>
                    {r.goalTitles.length ? r.goalTitles.join('، ') : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 6,
                      background: r.status === 'open' ? '#2a78d611' : 'hsl(var(--muted))',
                      color: r.status === 'open' ? '#2a78d6' : 'hsl(var(--muted-foreground))',
                    }}>
                      {r.status === 'open' ? (ar ? 'مفتوح' : 'Open') : (ar ? 'مغلق' : 'Closed')}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <Link href={r.href} style={{ color: '#2a78d6', display: 'inline-flex' }} title={ar ? 'فتح' : 'Open'}>
                      <ExternalLink size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '4px 8px', fontWeight: 400 };
const td: React.CSSProperties = { padding: '8px 8px', verticalAlign: 'top' };
