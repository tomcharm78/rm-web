'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/providers/language-provider';
import { createVacation, computeConflicts } from '@/lib/vacations/queries';
import {
  LEAVE_TYPE_LABELS, leaveDayCount, todayIso,
  type LeaveType, type ConflictEntry,
} from '@/types/vacation';

const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'emergency', 'hajj', 'maternity', 'paternity', 'death', 'unpaid', 'business', 'other'];

export function VacationRequestModal({ onClose }: { onClose: () => void }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [leaveTypeOther, setLeaveTypeOther] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // live conflict preview when both dates set
  useEffect(() => {
    if (startDate && endDate && endDate >= startDate) {
      computeConflicts(startDate, endDate).then(setConflicts).catch(() => setConflicts([]));
    } else {
      setConflicts([]);
    }
  }, [startDate, endDate]);

  const dayCount = startDate && endDate && endDate >= startDate ? leaveDayCount(startDate, endDate) : 0;

  async function save() {
    setErr(null);
    if (!startDate || !endDate) { setErr(ar ? 'يرجى تحديد التواريخ' : 'Please set both dates'); return; }
    if (endDate < startDate) { setErr(ar ? 'تاريخ النهاية قبل البداية' : 'End date is before start date'); return; }
    if (!reason.trim()) { setErr(ar ? 'السبب مطلوب' : 'Reason is required'); return; }
    if (leaveType === 'other' && !leaveTypeOther.trim()) { setErr(ar ? 'يرجى تحديد نوع الإجازة' : 'Please specify the leave type'); return; }
    setSaving(true);
    try {
      await createVacation({ leaveType, leaveTypeOther, startDate, endDate, reason });
      qc.invalidateQueries({ queryKey: ['vacations'] });
      onClose();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'hsl(var(--card))', borderRadius: 12, padding: '1.5rem', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>{ar ? 'طلب إجازة' : 'Request leave'}</div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>{ar ? 'نوع الإجازة' : 'Leave type'}</label>
          <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)} style={inp}>
            {LEAVE_TYPES.map((t) => <option key={t} value={t}>{ar ? LEAVE_TYPE_LABELS[t].ar : LEAVE_TYPE_LABELS[t].en}</option>)}
          </select>
        </div>

        {leaveType === 'other' && (
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>{ar ? 'حدّد النوع' : 'Specify type'}</label>
            <input value={leaveTypeOther} onChange={(e) => setLeaveTypeOther(e.target.value)} style={inp} />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={lbl}>{ar ? 'من' : 'From'}</label>
            <input type="date" min={todayIso()} value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>{ar ? 'إلى' : 'To'}</label>
            <input type="date" min={startDate || todayIso()} value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inp} />
          </div>
        </div>

        {dayCount > 0 && (
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 14 }}>
            {ar ? `${dayCount} يوم` : `${dayCount} day${dayCount > 1 ? 's' : ''}`}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>{ar ? 'السبب' : 'Reason'}</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} />
        </div>

        {conflicts.length > 0 && (
          <div style={{ background: '#eda10011', border: '0.5px solid #eda10044', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#c98500', marginBottom: 4 }}>
              {ar ? `${conflicts.length} من زملائك في إجازة خلال هذه الفترة` : `${conflicts.length} colleague${conflicts.length > 1 ? 's' : ''} off during these dates`}
            </div>
            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
              {conflicts.map((c) => c.name).join('، ')}
            </div>
          </div>
        )}

        {err && <div style={{ fontSize: 12, color: '#e34948', marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnGhost}>{ar ? 'إلغاء' : 'Cancel'}</button>
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? (ar ? 'جارٍ الإرسال…' : 'Submitting…') : (ar ? 'إرسال الطلب' : 'Submit request')}</button>
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', borderRadius: 8, border: '0.5px solid hsl(var(--border))', padding: '7px 10px', fontSize: 13, background: 'hsl(var(--background))', color: 'hsl(var(--foreground))' };
const btnGhost: React.CSSProperties = { fontSize: 13, padding: '7px 14px', borderRadius: 8, border: '0.5px solid hsl(var(--border))', background: 'hsl(var(--muted))', cursor: 'pointer', color: 'hsl(var(--foreground))' };
const btnPrimary: React.CSSProperties = { fontSize: 13, padding: '7px 16px', borderRadius: 8, border: 'none', background: '#2a78d6', cursor: 'pointer', color: '#fff' };
