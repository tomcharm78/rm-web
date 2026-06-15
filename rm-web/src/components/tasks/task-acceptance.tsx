'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { acceptTask, declineTask } from '@/lib/tasks/queries';
import type { Task } from '@/types/task';

export function TaskAcceptance({ task }: { task: Task }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const isAssignee = user?.id === task.assignedToId;
  const isPending = task.status === 'pending';
  const declined = !!task.declinedAt;
  const accepted = !!task.acceptedAt;

  const [showDecline, setShowDecline] = useState(false);
  const [reason, setReason] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['task-milestones', task.id] });
    qc.invalidateQueries({ queryKey: ['task', task.id] });
    qc.invalidateQueries({ queryKey: ['task-history', task.id] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };

  const accept = useMutation({ mutationFn: () => acceptTask(task.id), onSuccess: refresh });
  const decline = useMutation({
    mutationFn: () => declineTask(task.id, reason),
    onSuccess: () => {
      setReason('');
      setShowDecline(false);
      refresh();
    },
  });

  if (isPending && declined) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-4 text-sm">
        <div className="flex items-center gap-2 font-semibold text-red-800">
          <AlertTriangle className="h-4 w-4" />
          {isAssignee
            ? ar ? 'لقد رفضت هذه المهمة' : 'You declined this task'
            : ar ? 'تم رفض المهمة — تحتاج إعادة تعيين' : 'Declined — needs reassignment'}
        </div>
        {task.declineReason && <p className="text-red-700 mt-1">{task.declineReason}</p>}
      </div>
    );
  }

  if (isAssignee && isPending && !accepted) {
    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 mb-4">
        {!showDecline ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 text-sm text-indigo-900">
              <div className="font-semibold">
                {ar ? 'مهمة جديدة بانتظار قبولك' : 'New task awaiting your acceptance'}
              </div>
              <div className="text-indigo-700">
                {ar ? 'اقبل لبدء العمل، أو ارفض مع ذكر السبب.' : 'Accept to start work, or decline with a reason.'}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => accept.mutate()} disabled={accept.isPending} className="gap-2 bg-green-600 hover:bg-green-700">
                {accept.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {ar ? 'قبول' : 'Accept'}
              </Button>
              <Button variant="outline" onClick={() => setShowDecline(true)} className="gap-2">
                <X className="h-4 w-4" />
                {ar ? 'رفض' : 'Decline'}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs font-medium text-slate-700">{ar ? 'سبب الرفض' : 'Reason for declining'}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              placeholder={ar ? 'لماذا لا يمكنك تولّي هذه المهمة؟' : 'Why can’t you take this task?'}
            />
            <div className="flex gap-2 mt-2">
              <Button onClick={() => decline.mutate()} disabled={!reason.trim() || decline.isPending} className="gap-2 bg-red-600 hover:bg-red-700">
                {decline.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {ar ? 'إرسال الرفض' : 'Submit decline'}
              </Button>
              <Button variant="outline" onClick={() => { setShowDecline(false); setReason(''); }}>
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
            {decline.isError && <p className="text-xs text-red-600 mt-1">{(decline.error as Error)?.message}</p>}
          </div>
        )}
        {accept.isError && <p className="text-xs text-red-600 mt-2">{(accept.error as Error)?.message}</p>}
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 mb-4 text-sm text-green-800 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" />
        {ar ? 'تم قبول المهمة' : 'Task accepted'}
        {task.acceptedAt ? <span className="text-green-600">· {new Date(task.acceptedAt).toLocaleDateString()}</span> : null}
      </div>
    );
  }

  return null;
}
