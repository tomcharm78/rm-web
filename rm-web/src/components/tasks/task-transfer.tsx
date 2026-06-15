'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, X, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import {
  getTaskTransfer,
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  cancelTransfer,
  listAssignableUsers,
} from '@/lib/tasks/queries';
import type { Task } from '@/types/task';

export function TaskTransfer({ task }: { task: Task }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const [showRequest, setShowRequest] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [err, setErr] = useState('');

  const { data: transfer } = useQuery({
    queryKey: ['task-transfer', task.id],
    queryFn: () => getTaskTransfer(task.id),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['assignable-users'],
    queryFn: () => listAssignableUsers(),
  });

  const nameOf = (id: string | null) => {
    const u = users.find((x) => x.id === id);
    return u ? (ar ? u.nameAr || u.name : u.name) : '—';
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['task-transfer', task.id] });
    qc.invalidateQueries({ queryKey: ['task', task.id] });
    qc.invalidateQueries({ queryKey: ['task-history', task.id] });
    qc.invalidateQueries({ queryKey: ['task-milestones', task.id] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };

  const requestMut = useMutation({
    mutationFn: () => requestTransfer(task.id, targetId, reason),
    onSuccess: () => {
      setShowRequest(false);
      setTargetId('');
      setReason('');
      setErr('');
      invalidate();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const approveMut = useMutation({
    mutationFn: () => approveTransfer(transfer!.id, task.id, transfer!.targetUserId),
    onSuccess: invalidate,
    onError: (e: Error) => setErr(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectTransfer(transfer!.id, rejectReason),
    onSuccess: () => {
      setShowReject(false);
      setRejectReason('');
      setErr('');
      invalidate();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelTransfer(transfer!.id),
    onSuccess: invalidate,
    onError: (e: Error) => setErr(e.message),
  });

  const isAssignee = user?.id === task.assignedToId;
  const isClosed = task.status === 'done' || task.status === 'cancelled';
  const pending = transfer?.status === 'requested';
  const rejected = transfer?.status === 'rejected';

  const requesterRole = users.find((u) => u.id === transfer?.requesterId)?.role;
  const isSuper = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';
  const notRequester = user?.id !== transfer?.requesterId;
  const canApprove =
    !!pending &&
    notRequester &&
    ((['rm', 'arm'].includes(requesterRole ?? '') && (isAdmin || isSuper)) ||
      (requesterRole === 'admin' && isSuper));

  const isRequester = pending && user?.id === transfer?.requesterId;
  const targetOptions = users.filter((u) => u.id !== user?.id);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <ArrowLeftRight className="h-4 w-4 text-indigo-600" />
        {ar ? 'نقل المهمة' : 'Task transfer'}
      </div>

      {pending && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="text-amber-800">
            {ar ? 'طلب نقل إلى' : 'Transfer requested →'}{' '}
            <span className="font-semibold">{nameOf(transfer!.targetUserId)}</span>{' '}
            {ar ? '· بانتظار الموافقة' : '· awaiting approval'}
          </p>
          <p className="mt-1 text-amber-700">
            {ar ? 'السبب: ' : 'Reason: '}
            {transfer!.reason}
          </p>

          {canApprove && !showReject && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => approveMut.mutate()}
                disabled={approveMut.isPending}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {approveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                {ar ? 'موافقة ونقل' : 'Approve & transfer'}
              </button>
              <button
                onClick={() => setShowReject(true)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {ar ? 'رفض' : 'Reject'}
              </button>
            </div>
          )}

          {canApprove && showReject && (
            <div className="mt-3 space-y-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder={ar ? 'سبب الرفض (مطلوب)' : 'Reason for rejection (required)'}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => rejectMut.mutate()}
                  disabled={!rejectReason.trim() || rejectMut.isPending}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {ar ? 'تأكيد الرفض' : 'Confirm reject'}
                </button>
                <button
                  onClick={() => {
                    setShowReject(false);
                    setRejectReason('');
                  }}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {ar ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {isRequester && (
            <button
              onClick={() => cancelMut.mutate()}
              disabled={cancelMut.isPending}
              className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {ar ? 'إلغاء الطلب' : 'Cancel request'}
            </button>
          )}
        </div>
      )}

      {!pending && rejected && isAssignee && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {ar ? 'تم رفض النقل: ' : 'Transfer declined: '}
          {transfer!.rejectionReason}
        </div>
      )}

      {isAssignee && !pending && !isClosed && (
        <button
          onClick={() => setShowRequest(true)}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
        >
          <ArrowLeftRight className="h-3 w-3" />
          {ar ? 'طلب نقل المهمة' : 'Request transfer'}
        </button>
      )}

      {!isAssignee && !pending && !rejected && (
        <p className="text-xs text-gray-400">{ar ? 'لا يوجد طلب نقل' : 'No transfer request'}</p>
      )}

      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}

      {showRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                {ar ? 'طلب نقل المهمة' : 'Request task transfer'}
              </h3>
              <button onClick={() => setShowRequest(false)}>
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            <label className="mb-1 block text-xs font-medium text-gray-600">{ar ? 'نقل إلى' : 'Transfer to'}</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="mb-3 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">{ar ? 'اختر مستخدمًا…' : 'Select a user…'}</option>
              {targetOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {ar ? u.nameAr || u.name : u.name} ({u.role})
                </option>
              ))}
            </select>

            <label className="mb-1 block text-xs font-medium text-gray-600">{ar ? 'السبب (مطلوب)' : 'Reason (required)'}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mb-3 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRequest(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => requestMut.mutate()}
                disabled={!targetId || !reason.trim() || requestMut.isPending}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {requestMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                {ar ? 'إرسال الطلب' : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}