'use client';

// Task detail (read-only view). Header, metadata, description, completion,
// linked session, and the status-change history. The action bar (status
// workflow, completion edit, reassign, cancel, edit) is added next.

import { useAuth } from '@/providers/auth-provider';
import { useSearchParams } from 'next/navigation';
import { updateTaskDescription } from '@/lib/tasks/queries';
import { taskHasActiveTaskForce } from '@/lib/task-force/queries';
import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, AlertTriangle, Loader2, Clock, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '@/providers/language-provider';
import {
  getTask,
  getTaskStatusHistory,
  listUserNames,
  listTaskDomains,
} from '@/lib/tasks/queries';
import { getSession } from '@/lib/sessions/queries';
import { getChallenge } from '@/lib/challenges/queries';
import { TaskMilestones } from '@/components/tasks/task-milestones';
import { TaskAcceptance } from '@/components/tasks/task-acceptance';
import { TaskActions } from '@/components/tasks/task-actions';
import { AttachmentsPanel } from '@/components/attachments/attachments-panel';
import { GoalLinkPanel } from '@/components/kpi/goal-link-panel';
import { TaskTransfer } from '@/components/tasks/task-transfer';
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  isOverdue,
  type TaskStatus,
  type TaskPriority,
} from '@/types/task';

const STATUS_BADGE: Record<TaskStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-50 text-blue-700',
  blocked: 'bg-amber-50 text-amber-700',
  done: 'bg-green-50 text-green-700',
  cancelled: 'bg-slate-100 text-slate-400',
};
const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
};

export function TaskDetailClient({ taskId }: { taskId: string }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
// A support notification deep-links here with the subtask it concerns.
  const searchParams = useSearchParams();
  const focusSubtaskId = searchParams.get('subtask');
  const taskQ = useQuery({ queryKey: ['task', taskId], queryFn: () => getTask(taskId), refetchInterval: 10_000 });
  const historyQ = useQuery({
    queryKey: ['task-history', taskId],
    queryFn: () => getTaskStatusHistory(taskId),
  });
  const usersQ = useQuery({ queryKey: ['user-names'], queryFn: listUserNames });
  const domainsQ = useQuery({ queryKey: ['task-domains'], queryFn: listTaskDomains });

  const task = taskQ.data;
  const tfActiveQ = useQuery({
    queryKey: ['task-has-tf', task?.id],
    queryFn: () => taskHasActiveTaskForce(task!.id),
    enabled: !!task,
  });
  const isLead = !!tfActiveQ.data;
  const { user } = useAuth();
  // Description inline edit — assignee, creator, or super_admin.
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [descLocal, setDescLocal] = useState<{ en: string; ar: string } | null>(null);
  const sessionAccessQ = useQuery({
    queryKey: ['task-source-session', task?.sourceSessionId],
    queryFn: () => getSession(task!.sourceSessionId!),
    enabled: !!task?.sourceSessionId,
  });
  const canOpenSession = !!sessionAccessQ.data;
  const challengeAccessQ = useQuery({
    queryKey: ['task-source-challenge', task?.sourceChallengeId],
    queryFn: () => getChallenge(task!.sourceChallengeId!),
    enabled: !!task?.sourceChallengeId,
  });
  const canOpenChallenge = !!challengeAccessQ.data;
  const history = historyQ.data ?? [];
  const [historyOpen, setHistoryOpen] = useState(false);
  const users = usersQ.data ?? [];
  const domains = domainsQ.data ?? [];

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, ar ? u.nameAr || u.name : u.name));
    return m;
  }, [users, ar]);
  const personName = (id: string | null) => (id ? nameById.get(id) ?? '—' : '—');
  const domainName = (id: string) => {
    const d = domains.find((x) => x.id === id);
    return d ? (ar ? d.nameAr : d.name) : '—';
  };

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(ar ? 'ar' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString(ar ? 'ar' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  if (taskQ.isLoading) {
    return (
      <div className="p-8 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin inline" />
      </div>
    );
  }


  if (taskQ.isError) {
    return <div className="p-8 text-sm text-red-700">{(taskQ.error as Error)?.message}</div>;
  }
  if (!task) {
    return (
      <div className="p-6 lg:p-8">
        <Link href="/tasks" className="text-sm text-indigo-600 inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          {ar ? 'العودة للمهام' : 'Back to tasks'}
        </Link>
        <p className="mt-4 text-slate-500">{ar ? 'المهمة غير موجودة.' : 'Task not found.'}</p>
      </div>
    );
  }
  const canEditDesc =
    !!user && !!task &&
    (user.id === task.assignedToId || user.id === task.createdById || user.role === 'super_admin');
  const shownDesc = descLocal ?? { en: task.description ?? '', ar: task.descriptionAr ?? '' };
  const over = isOverdue(task);

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <Link
        href="/tasks"
        className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        {ar ? 'العودة للمهام' : 'Back to tasks'}
      </Link>

      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">
              {ar ? task.titleAr || task.title : task.title}
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">{ar ? task.title : task.titleAr}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={'inline-block rounded-full px-2.5 py-1 text-xs ' + STATUS_BADGE[task.status]}>
              {STATUS_LABELS[task.status][ar ? 'ar' : 'en']}
            </span>
            <span className={'inline-block rounded px-2.5 py-1 text-xs ' + PRIORITY_BADGE[task.priority]}>
              {PRIORITY_LABELS[task.priority][ar ? 'ar' : 'en']}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5 text-sm">
          <Meta label={ar ? 'المجال' : 'Domain'} value={domainName(task.domainId)} />
          <Meta
            label={ar ? 'المسؤول' : 'Assignee'}
            value={
              <span className="inline-flex items-center gap-1.5">
                {personName(task.assignedToId)}
                {isLead && user?.id !== task.assignedToId && (
                  <span className="text-[10px] font-semibold bg-indigo-600 text-white rounded px-1.5 py-0.5">
                    LEAD
                  </span>
                )}
              </span>
            }
          />
          <Meta label={ar ? 'أنشئت بواسطة' : 'Created by'} value={personName(task.createdById)} />
          <Meta
            label={ar ? 'الاستحقاق' : 'Due date'}
            value={fmtDate(task.tatDueDate)}
            valueClass={over ? 'text-red-600 font-medium' : ''}
            icon={over ? <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> : undefined}
          />
          <Meta label={ar ? 'تاريخ الإنشاء' : 'Created'} value={fmtDate(task.createdAt)} />
          {task.completedAt && <Meta label={ar ? 'اكتملت في' : 'Completed'} value={fmtDate(task.completedAt)} />}
          {task.cancelledAt && <Meta label={ar ? 'ألغيت في' : 'Cancelled'} value={fmtDate(task.cancelledAt)} />}
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{ar ? 'نسبة الإنجاز' : 'Completion'}</span>
            <span>{task.completionPercentage}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-indigo-500" style={{ width: `${task.completionPercentage}%` }} />
          </div>
        </div>
      </div>

      {(shownDesc.en || shownDesc.ar || canEditDesc) && (
        <div className="bg-white rounded-lg border border-slate-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">{ar ? 'الوصف' : 'Description'}</h2>
            {canEditDesc && !editingDesc && (
              <button
                onClick={() => { setDescDraft(ar ? shownDesc.ar : shownDesc.en); setEditingDesc(true); }}
                className="text-slate-400 hover:text-slate-600"
                title={ar ? 'تعديل' : 'Edit'}
              >
                ✎
              </button>
            )}
          </div>
          {editingDesc ? (
            <div>
              <textarea
                dir={ar ? 'rtl' : 'ltr'}
                rows={3}
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <div className="mt-2 flex gap-2 justify-end">
                <button onClick={() => setEditingDesc(false)} className="text-xs px-3 py-1.5 rounded-md border border-slate-200">
                  {ar ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={async () => {
                    const next = ar
                      ? { en: shownDesc.en, ar: descDraft }
                      : { en: descDraft, ar: shownDesc.ar };
                    await updateTaskDescription(task.id, next.en, next.ar);
                    setDescLocal(next);
                    setEditingDesc(false);
                  }}
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-900 text-white"
                >
                  {ar ? 'حفظ' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {shownDesc.en && <p className="text-sm text-slate-700 whitespace-pre-wrap" dir="ltr">{shownDesc.en}</p>}
              {shownDesc.ar && <p className="text-sm text-slate-700 whitespace-pre-wrap mt-2" dir="rtl">{shownDesc.ar}</p>}
              {!shownDesc.en && !shownDesc.ar && <p className="text-sm text-slate-400">{ar ? 'لا يوجد وصف' : 'No description'}</p>}
            </>
          )}
        </div>
      )}

      <TaskActions task={task} />
      <TaskAcceptance task={task} />

      <TaskMilestones task={task} focusSubtaskId={focusSubtaskId} />
      <AttachmentsPanel entityType="task" entityId={task.id} />

      <div className="mt-4">
        {/* Governance links OTHERS' work to strategy — their own tasks are
            administrative and carry no goal link. */}
        {!['pmo', 'pm'].includes(
          (usersQ.data ?? []).find((u) => u.id === task.assignedToId)?.role ?? ''
        ) && (
          <GoalLinkPanel entityType="task" entityId={task.id} locked={task.status === 'done' || task.status === 'cancelled'} />
        )}
      </div>

      {task.status === 'done' && task.closureNote && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 text-sm text-green-900">
          <div className="font-semibold mb-1">{ar ? 'ملاحظة الإغلاق' : 'Closure note'}</div>
          {task.closureNote}
        </div>
      )}
      {task.status === 'cancelled' && task.cancelReason && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 text-sm text-slate-700">
          <div className="font-semibold mb-1">{ar ? 'سبب الإلغاء' : 'Cancellation reason'}</div>
          {task.cancelReason}
        </div>
      )}

      {task.sourceSessionId && (
        <Link
          href={`/sessions/${task.sourceSessionId}`}
          className="bg-white rounded-lg border border-slate-200 p-4 mb-4 flex items-center gap-2 text-sm text-indigo-700 hover:bg-slate-50"
        >
          <CalendarClock className="h-4 w-4" />
          {ar ? 'هذه المهمة ناتجة عن جلسة — عرض الجلسة' : 'This task originated from a session — view session'}
        </Link>
      )}
      {task.sourceChallengeId && canOpenChallenge && (
        <Link
          href={`/challenges/${task.sourceChallengeId}`}
          className="bg-white rounded-lg border border-slate-200 p-4 mb-4 flex items-center gap-2 text-sm text-indigo-700 hover:bg-slate-50"
        >
          <AlertTriangle className="h-4 w-4" />
          {ar ? 'هذه المهمة ناتجة عن تحدٍّ — عرض التحدي' : 'This task originated from a challenge — view challenge'}
        </Link>
      )}

      <TaskTransfer task={task} />
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-sm font-semibold"
        >
          <Clock className="h-4 w-4 text-slate-400" />
          {ar ? 'سجل الحالة' : 'Status history'}
          {history.length > 0 && (
            <span className="text-xs font-normal text-slate-400">({history.length})</span>
          )}
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ms-auto ${historyOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {historyOpen && (
          <div className="mt-3">
            {historyQ.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-400">{ar ? 'لا توجد تغييرات بعد.' : 'No changes yet.'}</p>
            ) : (
              <ul className="space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="text-sm border-s-2 border-slate-100 ps-3">
                    <div className="text-slate-700">
                      <span className="text-slate-400">{STATUS_LABELS[h.fromStatus][ar ? 'ar' : 'en']}</span>
                      {' → '}
                      <span className="font-medium">{STATUS_LABELS[h.toStatus][ar ? 'ar' : 'en']}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {personName(h.changedById)} · {fmtDateTime(h.changedAt)}
                    </div>
                    {h.changeReason && <div className="text-xs text-slate-500 mt-0.5">{h.changeReason}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  valueClass,
  icon,
}: {
  label: string;
  value: string;
  valueClass?: string;
  icon?: ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={'mt-0.5 inline-flex items-center gap-1 ' + (valueClass ?? 'text-slate-700')}>
        {icon}
        {value}
      </div>
    </div>
  );
}