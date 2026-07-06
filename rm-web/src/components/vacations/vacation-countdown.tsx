'use client';

import { useQuery } from '@tanstack/react-query';
import { Plane } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { getMyUpcomingLeave } from '@/lib/vacations/queries';
import { getMyModulesControl } from '@/lib/modules/queries';
import { leaveTypeLabel, daysUntil, leaveDayCount } from '@/types/vacation';

export function VacationCountdown() {
  const { language } = useLanguage();
  const ar = language === 'ar';

  const modulesCtl = useQuery({ queryKey: ['my-modules-control'], queryFn: getMyModulesControl });
  const on = (modulesCtl.data?.settings ?? {})['vacations'] === true;

  const q = useQuery({ queryKey: ['my-upcoming-leave'], queryFn: getMyUpcomingLeave, enabled: on });

  if (!on || !q.data) return null;

  const leave = q.data;
  const days = daysUntil(leave.startDate);
  const dur = leaveDayCount(leave.startDate, leave.endDate);

  return (
    <div style={{ background: 'linear-gradient(135deg,#1a6b4a,#199e70)', borderRadius: 12, padding: '1rem 1.25rem', color: '#fff', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Plane size={22} />
        </div>
        <div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            {ar ? 'إجازتك القادمة' : 'Your upcoming leave'} · {leaveTypeLabel(leave.leaveType, ar, leave.leaveTypeOther)}
          </div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            {days === 0
              ? (ar ? 'تبدأ اليوم' : 'Starts today')
              : days === 1
                ? (ar ? 'تبدأ غدًا' : 'Starts tomorrow')
                : (ar ? `بعد ${days} يومًا` : `In ${days} days`)}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 16px' }}>
        <div style={{ fontSize: 22, fontWeight: 500 }}>{dur}</div>
        <div style={{ fontSize: 11, opacity: 0.8 }}>{ar ? 'يوم' : dur > 1 ? 'days' : 'day'}</div>
      </div>
    </div>
  );
}
