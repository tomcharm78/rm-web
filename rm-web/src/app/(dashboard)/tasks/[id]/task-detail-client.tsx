'use client';

// Task detail (read-only view). Header, metadata, description, completion,
// linked session, and the status-change history. The action bar (status
// workflow, completion edit, reassign, cancel, edit) is added next.

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
import { TaskMilestones } from '@/components/tasks/task-milestones';
import { TaskAcceptance } from '@/components/tasks/task-acceptance';
import { TaskActions } from '@/components/tasks/task-actions';
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

  const taskQ = useQuery({ queryKey: ['task', taskId], queryFn: () => getTask(taskId) });
  const historyQ = useQuery({
    queryKey: ['task-history', taskId],
    queryFn: () => getTaskStatusHistory(taskId),
  });
  const usersQ = useQuery({ queryKey: ['user-names'], queryFn: listUserNames });
  const domainsQ = useQuery({ queryKey: ['task-domains'], queryFn: listTaskDomains });

  const task = taskQ.data;
  const sessionAccessQ = useQuery({
    queryKey: ['task-source-session', task?.sourceSessionId],
    queryFn: () => getSession(task!.sourceSessionId!),
    enabled: !!task?.sourceSessionId,
  });
  const canOpenSession = !!sessionAccessQ.data;
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
          <Meta label={ar ? 'المسؤول' : 'Assignee'} value={personName(task.assignedToId)} />
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

      {(task.description || task.descriptionAr) && (
        <div className="bg-white rounded-lg border border-slate-200 p-5 mb-4">
          <h2 className="text-sm font-semibold mb-2">{ar ? 'الوصف' : 'Description'}</h2>
          {task.description && (
            <p className="text-sm text-slate-700 whitespace-pre-wrap" dir="ltr">{task.description}</p>
          )}
          {task.descriptionAr && (
            <p className="text-sm text-slate-700 whitespace-pre-wrap mt-2" dir="rtl">{task.descriptionAr}</p>
          )}
        </div>
      )}

      <TaskActions task={task} />
      <TaskAcceptance task={task} />

      <TaskMilestones task={task} />

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