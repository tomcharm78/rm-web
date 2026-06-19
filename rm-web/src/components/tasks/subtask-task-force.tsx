'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/providers/language-provider';
import {
  getTaskForceForSubtask,
  requestTaskForce,
  cancelTaskForceRequest,
} from '@/lib/task-force/queries';

export function SubtaskTaskForce({
  subtaskId,
  taskId,
  canRequest,
}: {
  subtaskId: string;
  taskId: string;
  canRequest: boolean;
}) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');

  const tfQ = useQuery({
    queryKey: ['task-force-subtask', subtaskId],
    queryFn: () => getTaskForceForSubtask(subtaskId),
  });
  const tf = tfQ.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ['task-force-subtask', subtaskId] });

  const requestMut = useMutation({
    mutationFn: () => requestTaskForce(taskId, subtaskId, note.trim()),
    onSuccess: () => { setOpen(false); setNote(''); refresh(); },
  });
  const cancelMut = useMutation({
    mutationFn: () => cancelTaskForceRequest(tf!.id),
    onSuccess: refresh,
  });

  if (tf) {
    const label =
      tf.status === 'requested' ? (ar ? 'بانتظار موافقة المسؤول' : 'Awaiting admin approval')
      : tf.status === 'sourcing' ? (ar ? 'يبحث المسؤول عن دعم' : 'Admin sourcing help')
      : tf.status === 'active' ? (ar ? 'فريق العمل نشط' : 'Task force active')
      : tf.status;
    const color =
      tf.status === 'active'
        ? 'text-green-700 bg-green-50 border-green-200'
        : 'text-amber-700 bg-amber-50 border-amber-200';
    return (
      <div className="mt-1 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] ${color}`}>
          <Users className="h-3 w-3" />
          {label}
        </span>
        {canRequest && tf.status !== 'active' && (
          <button
            type="button"
            onClick={() => cancelMut.mutate()}
            disabled={cancelMut.isPending}
            className="text-[11px] text-slate-500 hover:underline"
          >
            {ar ? 'إلغاء الطلب' : 'Cancel request'}
          </button>
        )}
      </div>
    );
  }

  if (!canRequest) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
      >
        <Users className="h-3 w-3" />
        {ar ? 'طلب فريق عمل' : 'Request Task Force'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
          onMouseDown={() => setOpen(false)}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md my-8" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <span className="text-sm font-semibold inline-flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-600" />
                {ar ? 'طلب فريق عمل' : 'Request Task Force'}
              </span>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 py-3 space-y-2">
              <label className="text-xs text-slate-600">
                {ar ? 'نوع الدعم المطلوب' : 'What support is needed?'}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder={ar ? 'صف المهارة أو المساعدة المطلوبة…' : 'Describe the skill or help required…'}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {requestMut.isError && (
                <p className="text-xs text-red-600">{(requestMut.error as Error)?.message}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={requestMut.isPending}>
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                onClick={() => requestMut.mutate()}
                disabled={requestMut.isPending || !note.trim()}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                {requestMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {ar ? 'إرسال الطلب' : 'Send request'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}