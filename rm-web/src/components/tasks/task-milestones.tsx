'use client';

// Milestones checklist + closure approval, embedded on the task detail page.
// Assignee: add / check / delete milestones (progress = checked/total) and
// submit a closing statement (requires >=1 milestone). Admin: approve (-> Closed)
// or reject-with-reason (back to the assignee). Display labels say "Milestones".

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Plus,
  Trash2,
  Check,
  ClipboardCheck,
  Send,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  listTaskMilestones,
  addTaskMilestone,
  toggleTaskMilestone,
  deleteTaskMilestone,
  submitClosure,
  approveClosure,
  rejectClosure,
} from '@/lib/tasks/queries';
import { milestoneProgress, type Task } from '@/types/task';

export function TaskMilestones({ task }: { task: Task }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();
  const taskId = task.id;

  const isAssignee = user?.id === task.assignedToId;
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isClosed = task.status === 'done' || task.status === 'cancelled';
  const awaitingApproval = !!task.closureRequestedAt;

  const [newM, setNewM] = useState('');
  const [newMAr, setNewMAr] = useState('');
  const [statement, setStatement] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const msQ = useQuery({ queryKey: ['task-milestones', taskId], queryFn: () => listTaskMilestones(taskId) });
  const milestones = msQ.data ?? [];
  const progress = milestoneProgress(milestones);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['task-milestones', taskId] });
    qc.invalidateQueries({ queryKey: ['task', taskId] });
    qc.invalidateQueries({ queryKey: ['task-history', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };

  const addM = useMutation({
    mutationFn: () => addTaskMilestone(taskId, newM, newMAr),
    onSuccess: () => {
      setNewM('');
      setNewMAr('');
      refresh();
    },
  });
  const toggleM = useMutation({
    mutationFn: (v: { id: string; done: boolean }) => toggleTaskMilestone(v.id, taskId, v.done),
    onSuccess: refresh,
  });
  const delM = useMutation({ mutationFn: (id: string) => deleteTaskMilestone(id, taskId), onSuccess: refresh });
  const submit = useMutation({
    mutationFn: () => submitClosure(taskId, statement),
    onSuccess: () => {
      setStatement('');
      refresh();
    },
  });
  const approve = useMutation({ mutationFn: () => approveClosure(taskId), onSuccess: refresh });
  const reject = useMutation({
    mutationFn: () => rejectClosure(taskId, rejectReason),
    onSuccess: () => {
      setRejectReason('');
      setShowReject(false);
      refresh();
    },
  });
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-indigo-600" />
          {ar ? 'المراحل' : 'Milestones'}
        </h2>
        <span className="text-xs text-slate-500">{progress}%</span>
      </div>

      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden mb-4">
        <div className="h-full bg-indigo-500" style={{ width: `${progress}%` }} />
      </div>

      {msQ.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : milestones.length === 0 ? (
        <p className="text-sm text-slate-400 mb-3">
          {ar ? 'لا توجد مراحل بعد.' : 'No milestones yet.'}
          {isAssignee && !isClosed ? (ar ? ' أضف مراحل لتتبع التقدم.' : ' Add milestones to track progress.') : ''}
        </p>
      ) : (
        <ul className="space-y-1.5 mb-3">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                disabled={!isAssignee || isClosed || toggleM.isPending}
                onClick={() => toggleM.mutate({ id: m.id, done: !m.isDone })}
                className={
                  'h-5 w-5 flex-shrink-0 rounded border inline-flex items-center justify-center ' +
                  (m.isDone ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white') +
                  (!isAssignee || isClosed ? ' opacity-60 cursor-default' : '')
                }
              >
                {m.isDone && <Check className="h-3.5 w-3.5" />}
              </button>
              <span className={'flex-1 ' + (m.isDone ? 'text-slate-400 line-through' : 'text-slate-700')}>
                {ar ? m.titleAr || m.title : m.title}
              </span>
              {isAssignee && !isClosed && (
                <button
                  type="button"
                  disabled={delM.isPending}
                  onClick={() => delM.mutate(m.id)}
                  className="text-slate-300 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAssignee && !isClosed && (
        <div className="flex flex-col sm:flex-row gap-2 mb-1">
          <Input
            dir="ltr"
            placeholder={ar ? 'مرحلة جديدة (EN)' : 'New milestone (EN)'}
            value={newM}
            onChange={(e) => setNewM(e.target.value)}
            disabled={addM.isPending}
          />
          <Input
            dir="rtl"
            placeholder={ar ? 'مرحلة جديدة (AR)' : 'New milestone (AR)'}
            value={newMAr}
            onChange={(e) => setNewMAr(e.target.value)}
            disabled={addM.isPending}
          />
          <Button
            onClick={() => addM.mutate()}
            disabled={!newM.trim() || addM.isPending}
            className="gap-1 bg-indigo-600 hover:bg-indigo-700 flex-shrink-0"
          >
            {addM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {ar ? 'إضافة' : 'Add'}
          </Button>
        </div>
      )}
      {addM.isError && <p className="text-xs text-red-600">{(addM.error as Error)?.message}</p>}

      <div className="border-t border-slate-100 mt-4 pt-4">
        {task.closureRejectedReason && !awaitingApproval && !isClosed && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 mb-3">
            <div className="font-semibold mb-0.5 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              {ar ? 'أُعيدت من المدير' : 'Sent back by admin'}
            </div>
            {task.closureRejectedReason}
          </div>
        )}

        {awaitingApproval && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900 mb-3">
            <div className="font-semibold mb-1">{ar ? 'بانتظار موافقة المدير' : 'Awaiting admin approval'}</div>
            {task.closureNote && <div className="text-blue-800">{task.closureNote}</div>}
          </div>
        )}

        {isAssignee && !isClosed && !awaitingApproval && (
          <div>
            <label className="text-xs text-slate-700">
              {ar ? 'بيان الإغلاق (للإرسال للموافقة)' : 'Closing statement (submit for approval)'}
            </label>
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              rows={3}
              disabled={submit.isPending}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1 mt-1"
              placeholder={ar ? 'صف ما تم إنجازه…' : 'Describe what was delivered…'}
            />
            <Button
              onClick={() => submit.mutate()}
              disabled={!statement.trim() || milestones.length === 0 || submit.isPending}
              className="gap-2 mt-2 bg-indigo-600 hover:bg-indigo-700"
            >
              {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {ar ? 'إرسال للإغلاق' : 'Submit for closure'}
            </Button>
            {milestones.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">
                {ar ? 'أضف مرحلة واحدة على الأقل قبل الإرسال.' : 'Add at least one milestone before submitting.'}
              </p>
            )}
            {submit.isError && <p className="text-xs text-red-600 mt-1">{(submit.error as Error)?.message}</p>}
          </div>
        )}

        {isAdmin && awaitingApproval && (
          <div className="mt-1">
            {!showReject ? (
              <div className="flex gap-2">
                <Button
                  onClick={() => approve.mutate()}
                  disabled={approve.isPending}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                  {ar ? 'موافقة وإغلاق' : 'Approve & close'}
                </Button>
                <Button variant="outline" onClick={() => setShowReject(true)} className="gap-2">
                  <ThumbsDown className="h-4 w-4" />
                  {ar ? 'رفض' : 'Reject'}
                </Button>
              </div>
            ) : (
              <div>
                <label className="text-xs text-slate-700">{ar ? 'سبب الرفض' : 'Reason for rejection'}</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder={ar ? 'وضّح سبب الإعادة…' : 'Explain why it is sent back…'}
                />
                <div className="flex gap-2 mt-2">
                  <Button
                    onClick={() => reject.mutate()}
                    disabled={!rejectReason.trim() || reject.isPending}
                    className="gap-2 bg-red-600 hover:bg-red-700"
                  >
                    {reject.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {ar ? 'إرسال الرفض' : 'Send rejection'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowReject(false)}>
                    {ar ? 'إلغاء' : 'Cancel'}
                  </Button>
                </div>
                {reject.isError && <p className="text-xs text-red-600 mt-1">{(reject.error as Error)?.message}</p>}
              </div>
            )}
            {approve.isError && <p className="text-xs text-red-600 mt-1">{(approve.error as Error)?.message}</p>}
          </div>
        )}
      </div>
    </div>
  );
}