'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Plane, Check, X, AlertTriangle, Archive } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import {
  listVacations, approveVacation, rejectVacation, cancelVacation, archiveVacation,
} from '@/lib/vacations/queries';
import {
  leaveTypeLabel, statusLabel, statusColor, leaveDayCount, isFutureLeave,
  type VacationRequest, type VacationStatus,
} from '@/types/vacation';
import { VacationRequestModal } from '@/components/vacations/vacation-request-modal';

function fmtDate(d: string, ar: boolean): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString(ar ? 'ar' : 'en', { day: 'numeric', month: 'short', year: 'numeric' });
}

// status priority for sort: pending(0) → approved(1) → rejected(2) → cancelled(3)
const STATUS_ORDER: Record<VacationStatus, number> = { pending: 0, approved: 1, rejected: 2, cancelled: 3 };

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export default function VacationsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const isManager = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuper = user?.role === 'super_admin';

  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  const [showModal, setShowModal] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // filters
  const [nameFilter, setNameFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState<string>(''); // '' | '0'..'11'
  const [yearFilter, setYearFilter] = useState<string>('');

  const view = tab === 'team' ? (isSuper ? 'all' : 'team') : 'mine';
  const q = useQuery({ queryKey: ['vacations', view], queryFn: () => listVacations(view) });
  const raw = q.data ?? [];

  // available years from the data
  const years = useMemo(() => {
    const s = new Set<string>();
    raw.forEach((r) => s.add(r.startDate.slice(0, 4)));
    return Array.from(s).sort().reverse();
  }, [raw]);

  const rows = useMemo(() => {
    let list = raw.filter((r) => {
      if (nameFilter && tab === 'team') {
        const nm = (ar ? r.requesterNameAr || r.requesterName : r.requesterName) ?? '';
        if (!nm.toLowerCase().includes(nameFilter.toLowerCase())) return false;
      }
      if (yearFilter && r.startDate.slice(0, 4) !== yearFilter) return false;
      if (monthFilter !== '') {
        const m = parseInt(r.startDate.slice(5, 7), 10) - 1;
        if (m !== parseInt(monthFilter, 10)) return false;
      }
      return true;
    });
    // sort: status priority, then pending=oldest-first (FIFO), others=newest-first
    list = [...list].sort((a, b) => {
      const sa = STATUS_ORDER[a.status], sb = STATUS_ORDER[b.status];
      if (sa !== sb) return sa - sb;
      if (a.status === 'pending') return a.createdAt.localeCompare(b.createdAt); // oldest first
      return b.createdAt.localeCompare(a.createdAt); // newest first
    });
    return list;
  }, [raw, nameFilter, monthFilter, yearFilter, tab, ar]);

  async function doApprove(id: string) { await approveVacation(id); qc.invalidateQueries({ queryKey: ['vacations'] }); }
  async function doReject(id: string) {
    if (!rejectReason.trim()) return;
    await rejectVacation(id, rejectReason);
    setRejecting(null); setRejectReason('');
    qc.invalidateQueries({ queryKey: ['vacations'] });
  }
  async function doCancel(r: VacationRequest) {
    if (!confirm(ar ? 'إلغاء هذا الطلب؟' : 'Cancel this request?')) return;
    await cancelVacation(r.id, r.startDate, r.status);
    qc.invalidateQueries({ queryKey: ['vacations'] });
  }
  async function doArchive(id: string) {
    if (!confirm(ar ? 'أرشفة هذا الطلب؟' : 'Archive this request?')) return;
    await archiveVacation(id);
    qc.invalidateQueries({ queryKey: ['vacations'] });
  }

  if (!user) return null;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Plane size={20} />
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>{ar ? 'الإجازات' : 'Vacations'}</h1>
        </div>
        <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#2a78d6', color: '#fff', cursor: 'pointer' }}>
          <Plus size={15} /> {ar ? 'طلب إجازة' : 'Request leave'}
        </button>
      </div>

      {isManager && (
        <div style={{ display: 'flex', gap: 6, marginTop: 16, marginBottom: 10 }}>
          {(['mine', 'team'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ fontSize: 13, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', border: '0.5px solid hsl(var(--border))', background: tab === t ? 'hsl(var(--foreground))' : 'transparent', color: tab === t ? 'hsl(var(--background))' : 'hsl(var(--foreground))' }}>
              {t === 'mine' ? (ar ? 'طلباتي' : 'My requests') : (isSuper ? (ar ? 'جميع الطلبات' : 'All requests') : (ar ? 'طلبات فريقي' : 'Team requests'))}
            </button>
          ))}
        </div>
      )}

      {/* filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, marginTop: isManager ? 0 : 16 }}>
        {tab === 'team' && (
          <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder={ar ? 'بحث بالاسم' : 'Filter by name'}
            style={{ ...fInp, minWidth: 160 }} />
        )}
        <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={fInp}>
          <option value="">{ar ? 'كل الأشهر' : 'All months'}</option>
          {(ar ? MONTHS_AR : MONTHS_EN).map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={fInp}>
          <option value="">{ar ? 'كل السنوات' : 'All years'}</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {(nameFilter || monthFilter !== '' || yearFilter) && (
          <button onClick={() => { setNameFilter(''); setMonthFilter(''); setYearFilter(''); }} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '0.5px solid hsl(var(--border))', background: 'transparent', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>
            {ar ? 'مسح' : 'Clear'}
          </button>
        )}
      </div>

      {q.isLoading ? (
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 20 }}>{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 20 }}>{ar ? 'لا توجد طلبات.' : 'No requests.'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r) => {
            const canManage = tab === 'team' && r.status === 'pending' && r.userId !== user.id;
            const canCancel = r.userId === user.id && (r.status === 'pending' || r.status === 'approved') && isFutureLeave(r.startDate);
            const canArchive = isManager && (r.status === 'rejected' || r.status === 'cancelled' || (r.status === 'approved' && !isFutureLeave(r.endDate)));
            return (
              <div key={r.id} style={{ background: 'hsl(var(--card))', border: '0.5px solid hsl(var(--border))', borderInlineStart: `3px solid ${statusColor(r.status)}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{leaveTypeLabel(r.leaveType, ar, r.leaveTypeOther)}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: statusColor(r.status) + '22', color: statusColor(r.status), fontWeight: 500 }}>{statusLabel(r.status, ar)}</span>
                    </div>
                    {tab === 'team' && <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>{ar ? r.requesterNameAr || r.requesterName : r.requesterName}</div>}
                    <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
                      {fmtDate(r.startDate, ar)} → {fmtDate(r.endDate, ar)} · {leaveDayCount(r.startDate, r.endDate)} {ar ? 'يوم' : 'days'}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 6 }}>{r.reason}</div>
                    {r.status === 'rejected' && r.rejectionReason && (
                      <div style={{ fontSize: 12, color: '#e34948', marginTop: 6 }}>{ar ? 'سبب الرفض:' : 'Rejection reason:'} {r.rejectionReason}</div>
                    )}
                    {r.approverName && (r.status === 'approved' || r.status === 'rejected') && (
                      <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>{ar ? 'بواسطة' : 'by'} {r.approverName}</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    {canCancel && (
                      <button onClick={() => doCancel(r)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '0.5px solid hsl(var(--border))', background: 'transparent', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>
                        {ar ? 'إلغاء' : 'Cancel'}
                      </button>
                    )}
                    {canArchive && (
                      <button onClick={() => doArchive(r.id)} title={ar ? 'أرشفة' : 'Archive'} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '0.5px solid hsl(var(--border))', background: 'transparent', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>
                        <Archive size={12} /> {ar ? 'أرشفة' : 'Archive'}
                      </button>
                    )}
                  </div>
                </div>

                {canManage && r.conflicts.length > 0 && (
                  <div style={{ background: '#eda10011', border: '0.5px solid #eda10044', borderRadius: 8, padding: '8px 10px', marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <AlertTriangle size={14} style={{ color: '#c98500', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#c98500' }}>{ar ? `${r.conflicts.length} من نفس القسم في إجازة متداخلة` : `${r.conflicts.length} in the department overlap these dates`}</div>
                      <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{r.conflicts.map((c) => c.name).join('، ')}</div>
                    </div>
                  </div>
                )}

                {canManage && (
                  <div style={{ marginTop: 10 }}>
                    {rejecting === r.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} placeholder={ar ? 'سبب الرفض' : 'Rejection reason'}
                          style={{ width: '100%', borderRadius: 8, border: '0.5px solid hsl(var(--border))', padding: '7px 10px', fontSize: 13, background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', resize: 'vertical' }} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => doReject(r.id)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', background: '#e34948', color: '#fff', cursor: 'pointer' }}>{ar ? 'تأكيد الرفض' : 'Confirm reject'}</button>
                          <button onClick={() => { setRejecting(null); setRejectReason(''); }} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '0.5px solid hsl(var(--border))', background: 'transparent', cursor: 'pointer', color: 'hsl(var(--foreground))' }}>{ar ? 'إلغاء' : 'Cancel'}</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => doApprove(r.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', background: '#199e70', color: '#fff', cursor: 'pointer' }}>
                          <Check size={13} /> {ar ? 'موافقة' : 'Approve'}
                        </button>
                        <button onClick={() => setRejecting(r.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '0.5px solid #e34948', background: 'transparent', color: '#e34948', cursor: 'pointer' }}>
                          <X size={13} /> {ar ? 'رفض' : 'Reject'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && <VacationRequestModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

const fInp: React.CSSProperties = { fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '0.5px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))' };
