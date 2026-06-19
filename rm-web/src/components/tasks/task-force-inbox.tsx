'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Loader2, Check, X, HandHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/providers/language-provider';
import { listUserNames } from '@/lib/tasks/queries';
import {
  listIncomingTaskForceRequests,
  listIncomingBorrows,
  listOtherDeptAdmins,
  listMyTeam,
  admin1Approve,
  admin1Reject,
  fanOutBorrows,
  approveBorrow,
  rejectBorrow,
} from '@/lib/task-force/queries';

export function TaskForceInbox() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const reqQ = useQuery({ queryKey: ['tf-incoming-requests'], queryFn: listIncomingTaskForceRequests, refetchInterval: 45000 });
  const borrowQ = useQuery({ queryKey: ['tf-incoming-borrows'], queryFn: listIncomingBorrows, refetchInterval: 45000 });
  const adminsQ = useQuery({ queryKey: ['tf-other-admins'], queryFn: listOtherDeptAdmins });
  const teamQ = useQuery({ queryKey: ['tf-my-team'], queryFn: listMyTeam });
  const namesQ = useQuery({ queryKey: ['user-names'], queryFn: listUserNames });

  const requests = reqQ.data ?? [];
  const borrows = borrowQ.data ?? [];
  const admins = adminsQ.data ?? [];
  const team = teamQ.data ?? [];
  const names = namesQ.data ?? [];
  const nameOf = (id?: string) => {
    const u = names.find((n) => n.id === id);
    return u ? (ar ? u.nameAr || u.name : u.name) : '—';
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['tf-incoming-requests'] });
    qc.invalidateQueries({ queryKey: ['tf-incoming-borrows'] });
    qc.invalidateQueries({ queryKey: ['task-force-subtask'] });
    qc.invalidateQueries({ queryKey: ['notifications-unread'] });
  };

  if (requests.length === 0 && borrows.length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      {requests.length > 0 && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-indigo-900">
            <Users className="h-4 w-4" />
            {ar ? 'طلبات فريق العمل' : 'Task Force requests'}
            <span className="text-xs bg-indigo-600 text-white rounded-full px-2 py-0.5">{requests.length}</span>
          </div>
          <div className="space-y-2">
            {requests.map((r) => (
              <RequestCard key={r.id} request={r} admins={admins} requesterName={nameOf(r.requestedBy)} onChanged={refresh} ar={ar} />
            ))}
          </div>
        </div>
      )}

      {borrows.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-emerald-900">
            <HandHeart className="h-4 w-4" />
            {ar ? 'طلبات دعم من إدارات أخرى' : 'Cross-department help requests'}
            <span className="text-xs bg-emerald-600 text-white rounded-full px-2 py-0.5">{borrows.length}</span>
          </div>
          <div className="space-y-2">
            {borrows.map((b) => (
              <BorrowCard key={b.id} borrow={b} team={team} requesterName={nameOf(b.requestedBy)} onChanged={refresh} ar={ar} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RequestCard({ request, admins, requesterName, onChanged, ar }: any) {
  const [mode, setMode] = useState<'idle' | 'borrow' | 'reject'>('idle');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');

  const approveMut = useMutation({
    mutationFn: async () => {
      await admin1Approve(request.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chosen = admins.filter((a: any) => picked[a.id]).map((a: any) => ({ id: a.id, departmentId: a.departmentId }));
      await fanOutBorrows(request.id, chosen);
    },
    onSuccess: onChanged,
  });
  const rejectMut = useMutation({ mutationFn: () => admin1Reject(request.id, reason.trim()), onSuccess: onChanged });
  const anyPicked = Object.values(picked).some(Boolean);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
      <div className="font-medium text-slate-800">{ar ? 'على المهمة: ' : 'On task: '}{request.taskTitle ?? '—'}</div>
      <div className="text-slate-600 mt-0.5"><span className="text-slate-400">{ar ? 'من: ' : 'From: '}</span>{requesterName}</div>
      <div className="mt-1 rounded bg-slate-50 border border-slate-100 px-2 py-1 text-slate-700">{request.requestNote || '—'}</div>

      {mode === 'idle' && (
        <div className="mt-2 flex gap-2">
          <Button onClick={() => setMode('borrow')} className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700">{ar ? 'موافقة والاستعارة' : 'Approve & borrow'}</Button>
          <Button variant="outline" onClick={() => setMode('reject')} className="h-8 text-xs">{ar ? 'رفض' : 'Reject'}</Button>
        </div>
      )}

      {mode === 'borrow' && (
        <div className="mt-2 space-y-2">
          <div className="text-xs text-slate-600">{ar ? 'اختر مسؤولي الإدارات للاستعارة منهم:' : 'Select department admins to borrow from:'}</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {admins.length === 0 && <div className="text-xs text-slate-400">{ar ? 'لا يوجد مسؤولون في إدارات أخرى' : 'No other-department admins'}</div>}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {admins.map((a: any) => (
              <label key={a.id} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={!!picked[a.id]} onChange={(e) => setPicked((p) => ({ ...p, [a.id]: e.target.checked }))} />
                {ar ? a.nameAr || a.name : a.name}<span className="text-slate-400">· {a.departmentName ?? '—'}</span>
              </label>
            ))}
          </div>
          {approveMut.isError && <p className="text-xs text-red-600">{(approveMut.error as Error)?.message}</p>}
          <div className="flex gap-2">
            <Button onClick={() => approveMut.mutate()} disabled={!anyPicked || approveMut.isPending} className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 gap-1">
              {approveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}{ar ? 'إرسال الطلبات' : 'Send requests'}
            </Button>
            <Button variant="outline" onClick={() => setMode('idle')} className="h-8 text-xs">{ar ? 'إلغاء' : 'Cancel'}</Button>
          </div>
        </div>
      )}

      {mode === 'reject' && (
        <div className="mt-2 space-y-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={ar ? 'سبب الرفض…' : 'Reason for rejection…'} className="w-full rounded border border-slate-200 px-2 py-1 text-xs" />
          <div className="flex gap-2">
            <Button onClick={() => rejectMut.mutate()} disabled={!reason.trim() || rejectMut.isPending} className="h-8 text-xs bg-red-600 hover:bg-red-700 gap-1">
              {rejectMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}{ar ? 'تأكيد الرفض' : 'Confirm reject'}
            </Button>
            <Button variant="outline" onClick={() => setMode('idle')} className="h-8 text-xs">{ar ? 'إلغاء' : 'Cancel'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BorrowCard({ borrow, team, requesterName, onChanged, ar }: any) {
  const [mode, setMode] = useState<'idle' | 'assign' | 'reject'>('idle');
  const [memberId, setMemberId] = useState('');
  const [reason, setReason] = useState('');

  const approveMut = useMutation({ mutationFn: () => approveBorrow(borrow.id, memberId), onSuccess: onChanged });
  const rejectMut = useMutation({ mutationFn: () => rejectBorrow(borrow.id, reason.trim()), onSuccess: onChanged });

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
      <div className="text-slate-600"><span className="text-slate-400">{ar ? 'من: ' : 'From: '}</span>{requesterName}</div>
      <div className="mt-1 rounded bg-slate-50 border border-slate-100 px-2 py-1 text-slate-700">{borrow.requestNote || '—'}</div>

      {mode === 'idle' && (
        <div className="mt-2 flex gap-2">
          <Button onClick={() => setMode('assign')} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700">{ar ? 'موافقة وتعيين' : 'Approve & assign'}</Button>
          <Button variant="outline" onClick={() => setMode('reject')} className="h-8 text-xs">{ar ? 'رفض' : 'Reject'}</Button>
        </div>
      )}

      {mode === 'assign' && (
        <div className="mt-2 space-y-2">
          {team.length === 0 ? (
            <div className="text-xs text-amber-700">{ar ? 'لا يوجد أعضاء في فريقك لتعيينهم.' : 'You have no team members to assign.'}</div>
          ) : (
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-xs">
              <option value="">{ar ? '— اختر عضوًا —' : '— Select a team member —'}</option>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {team.map((m: any) => (<option key={m.id} value={m.id}>{ar ? m.nameAr || m.name : m.name}</option>))}
            </select>
          )}
          {approveMut.isError && <p className="text-xs text-red-600">{(approveMut.error as Error)?.message}</p>}
          <div className="flex gap-2">
            <Button onClick={() => approveMut.mutate()} disabled={!memberId || approveMut.isPending} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1">
              {approveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}{ar ? 'تعيين' : 'Assign'}
            </Button>
            <Button variant="outline" onClick={() => setMode('idle')} className="h-8 text-xs">{ar ? 'إلغاء' : 'Cancel'}</Button>
          </div>
        </div>
      )}

      {mode === 'reject' && (
        <div className="mt-2 space-y-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={ar ? 'سبب الرفض…' : 'Reason for rejection…'} className="w-full rounded border border-slate-200 px-2 py-1 text-xs" />
          <div className="flex gap-2">
            <Button onClick={() => rejectMut.mutate()} disabled={!reason.trim() || rejectMut.isPending} className="h-8 text-xs bg-red-600 hover:bg-red-700 gap-1">
              {rejectMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}{ar ? 'تأكيد الرفض' : 'Confirm reject'}
            </Button>
            <Button variant="outline" onClick={() => setMode('idle')} className="h-8 text-xs">{ar ? 'إلغاء' : 'Cancel'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}