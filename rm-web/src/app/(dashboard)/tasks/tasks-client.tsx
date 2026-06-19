'use client';

// Tasks list. Role-scoped (rm/arm see their own; admin/super see all org tasks).
// Rows link to /tasks/[id] (detail page is the next file). Create/edit form and
// detail actions come in the following sub-batches.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Search, AlertTriangle, CalendarClock, Loader2, ShieldAlert, Plus,SlidersHorizontal } from 'lucide-react';
import { TaskForceInbox } from '@/components/tasks/task-force-inbox';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Input } from '@/components/ui/input';
import { TaskFormModal } from '@/components/tasks/task-form-modal';
import { listTasks, listTasksWithMySubtasks, listTaskDomains, listAssignableUsers, listDepartments, type TaskFilters } from '@/lib/tasks/queries';
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_PRIORITIES,
  isOverdue,
  type TaskStatus,
  type TaskPriority,
} from '@/types/task';

const STATUS_BADGE: Record<TaskStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-50 text-blue-700',
  blocked: 'bg-amber-50 text-amber-700',
  done: 'bg-green-50 text-green-700',
  cancelled: 'bg-slate-100 text-slate-400 line-through',
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
};

export function TasksClient() {
  const { user, isInitialized } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | 'all' | 'declined'>('all');
  const [priority, setPriority] = useState<TaskPriority | 'all'>('all');
  const [domainId, setDomainId] = useState<string | 'all'>('all');
  const [assigneeId, setAssigneeId] = useState<string | 'all'>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [departmentId, setDepartmentId] = useState<string | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<'assigned' | 'subtasks'>('assigned');
  const panelFieldCls =
    'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1';
  const activeFilterCount =
    (status !== 'all' ? 1 : 0) +
    (priority !== 'all' ? 1 : 0) +
    (domainId !== 'all' ? 1 : 0) +
    (assigneeId !== 'all' ? 1 : 0) +
    (overdueOnly ? 1 : 0);
  const clearFilters = () => {
    setStatus('all');
    setPriority('all');
    setDomainId('all');
    setAssigneeId('all');
    setOverdueOnly(false);
  };
  const [showAdd, setShowAdd] = useState(false);
  const queryClient = useQueryClient();
  const canCreate =
    user?.role === 'admin' ||
    user?.role === 'super_admin' ||
    (user?.permissions ?? []).includes('create_tasks');

  const isManager = user?.role === 'admin' || user?.role === 'super_admin';

  const serverStatus = status === 'declined' ? 'all' : status;
  const filters: TaskFilters = { search, status: serverStatus, priority, domainId, assigneeId, overdueOnly, departmentId };

  const tasksQ = useQuery({
    queryKey: ['tasks', view, filters, user?.id, user?.role],
    queryFn: () =>
      view === 'subtasks'
        ? listTasksWithMySubtasks()
        : listTasks(filters, { userId: user!.id, role: user!.role }),
    enabled: !!user,
  });
  const domainsQ = useQuery({ queryKey: ['task-domains'], queryFn: listTaskDomains });
  const usersQ = useQuery({ queryKey: ['assignable-all'], queryFn: () => listAssignableUsers() });
  const departmentsQ = useQuery({ queryKey: ['departments'], queryFn: listDepartments, enabled: user?.role === 'super_admin' });

  const tasks = useMemo(() => {
    const list = tasksQ.data ?? [];
    if (view === 'subtasks') return list;
    if (status === 'declined') return list.filter((t) => !!t.declinedAt);
    if (status === 'pending') return list.filter((t) => !t.declinedAt);
    return list;
  }, [tasksQ.data, status, view]);
  const domains = domainsQ.data ?? [];
  const users = usersQ.data ?? [];

  const domainName = (id: string) => {
    const d = domains.find((x) => x.id === id);
    return d ? (ar ? d.nameAr : d.name) : '—';
  };
  const userById = useMemo(() => {
    const m = new Map<string, { name: string; nameAr: string }>();
    users.forEach((u) => m.set(u.id, { name: u.name, nameAr: u.nameAr }));
    return m;
  }, [users]);
  const assigneeName = (id: string) => {
    const u = userById.get(id);
    return u ? (ar ? u.nameAr || u.name : u.name) : '—';
  };

  const fieldCls =
    'h-9 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1';
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(ar ? 'ar' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  if (!isInitialized) return <div className="p-8 text-slate-500">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>;
  if (!user) return null;
  if (user.role === 'investor') {
    return (
      <div className="p-6 lg:p-8">
        <div className="bg-white rounded-lg border border-slate-200 p-8 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5" />
          <p className="text-sm text-slate-500">{ar ? 'غير متاح' : 'Not available'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardList className="h-5 w-5 text-indigo-600" />
        <h1 className="text-xl font-semibold">{ar ? 'المهام' : 'Tasks'}</h1>
        <span className="text-sm text-slate-400">({tasks.length})</span>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        {ar ? 'إدارة المهام ومتابعة حالتها وإنجازها.' : 'Track tasks, their status and completion.'}
      </p>

      {isManager && <TaskForceInbox />}
      <div className="flex flex-col lg:flex-row gap-2 mb-4">
        <div className="inline-flex rounded-md border border-slate-200 overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setView('assigned')}
            className={
              'px-3 h-9 text-sm ' +
              (view === 'assigned' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')
            }
          >
            {ar ? 'المسندة إليّ' : 'Assigned to me'}
          </button>
          <button
            type="button"
            onClick={() => setView('subtasks')}
            className={
              'px-3 h-9 text-sm border-s border-slate-200 ' +
              (view === 'subtasks' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')
            }
          >
            {ar ? 'مهام فرعية أملكها' : 'Subtasks I own'}
          </button>
        </div>
        <div className="relative flex-1">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-slate-400" />
          <Input
            className="ps-9"
            placeholder={ar ? 'بحث بالعنوان…' : 'Search by title…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {user?.role === 'super_admin' && (
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={fieldCls}>
            <option value="all">{ar ? 'كل الإدارات' : 'All departments'}</option>
            {(departmentsQ.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>{ar ? d.nameAr || d.name : d.name}</option>
            ))}
          </select>
        )}
<div className="relative">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm inline-flex items-center gap-1.5 text-slate-600 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {ar ? 'تصفية' : 'Filters'}
            {activeFilterCount > 0 && (
              <span className="ms-1 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-indigo-600 text-white text-[11px]">
                {activeFilterCount}
              </span>
            )}
          </button>
          {showFilters && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowFilters(false)} />
              <div className="absolute z-50 mt-1 end-0 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">{ar ? 'تصفية' : 'Filters'}</span>
                  {activeFilterCount > 0 && (
                    <button type="button" onClick={clearFilters} className="text-xs text-indigo-600 hover:underline">
                      {ar ? 'مسح' : 'Clear'}
                    </button>
                  )}
                </div>
                <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | 'all' | 'declined')} className={panelFieldCls}>
                  <option value="all">{ar ? 'كل الحالات' : 'All statuses'}</option>
                  {TASK_STATUSES.filter((s) => s !== 'blocked').map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s][ar ? 'ar' : 'en']}</option>
                  ))}
                  <option value="declined">{ar ? 'مرفوضة' : 'Declined'}</option>
                </select>
                <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority | 'all')} className={panelFieldCls}>
                  <option value="all">{ar ? 'كل الأولويات' : 'All priorities'}</option>
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p][ar ? 'ar' : 'en']}</option>
                  ))}
                </select>
                <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className={panelFieldCls}>
                  <option value="all">{ar ? 'كل المجالات' : 'All domains'}</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>{ar ? d.nameAr : d.name}</option>
                  ))}
                </select>
                {isManager && (
                  <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={panelFieldCls}>
                    <option value="all">{ar ? 'كل المسؤولين' : 'All assignees'}</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{ar ? u.nameAr || u.name : u.name}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => setOverdueOnly((v) => !v)}
                  className={
                    'w-full h-9 rounded-md border px-3 text-sm inline-flex items-center justify-center gap-1.5 ' +
                    (overdueOnly
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')
                  }
                >
                  <AlertTriangle className="h-4 w-4" />
                  {ar ? 'المتأخرة فقط' : 'Overdue only'}
                </button>
              </div>
            </>
          )}
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="h-9 rounded-md bg-indigo-600 px-3 text-sm text-white inline-flex items-center gap-1.5 hover:bg-indigo-700 ms-auto"
          >
            <Plus className="h-4 w-4" />
            {ar ? 'إضافة مهمة' : 'Add Task'}
          </button>
        )}
      </div>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {tasksQ.isLoading ? (
          <div className="p-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : tasksQ.isError ? (
          <div className="p-6 text-sm text-red-700 bg-red-50">{(tasksQ.error as Error)?.message}</div>
        ) : tasks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">{ar ? 'لا توجد مهام.' : 'No tasks found.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs">
                  <th className="text-start font-medium px-4 py-2.5">{ar ? 'المهمة' : 'Task'}</th>
                  <th className="text-start font-medium px-4 py-2.5">{ar ? 'المسؤول' : 'Assignee'}</th>
                  <th className="text-start font-medium px-4 py-2.5">{ar ? 'الحالة' : 'Status'}</th>
                  <th className="text-start font-medium px-4 py-2.5">{ar ? 'الأولوية' : 'Priority'}</th>
                  <th className="text-start font-medium px-4 py-2.5">{ar ? 'الاستحقاق' : 'Due'}</th>
                  <th className="text-start font-medium px-4 py-2.5">{ar ? 'الإنجاز' : 'Progress'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((t) => {
                  const over = isOverdue(t);
                  return (
                    <tr key={t.id} className={'hover:bg-slate-50' + (t.declinedAt ? ' bg-red-50' : '')}>
                      <td className="px-4 py-3">
                        <Link href={`/tasks/${t.id}`} className="block">
                          <div className="font-medium text-slate-900 truncate max-w-xs">
                            {ar ? t.titleAr || t.title : t.title}
                          </div>
                          <div className="text-xs text-slate-400 truncate max-w-xs">{domainName(t.domainId)}</div>
                          {t.sourceSessionId && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 mt-0.5">
                              <CalendarClock className="h-3 w-3" />
                              {ar ? 'من جلسة' : 'from session'}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{assigneeName(t.assignedToId)}</td>
                      <td className="px-4 py-3">
                        {t.declinedAt ? (
                          <span className="inline-block rounded-full px-2 py-0.5 text-xs bg-red-100 text-red-700">
                            {ar ? 'مرفوضة' : 'Declined'}
                          </span>
                        ) : (
                          <span className={'inline-block rounded-full px-2 py-0.5 text-xs ' + STATUS_BADGE[t.status]}>
                            {STATUS_LABELS[t.status][ar ? 'ar' : 'en']}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={'inline-block rounded px-2 py-0.5 text-xs ' + PRIORITY_BADGE[t.priority]}>
                          {PRIORITY_LABELS[t.priority][ar ? 'ar' : 'en']}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={'inline-flex items-center gap-1 ' + (over ? 'text-red-600 font-medium' : 'text-slate-600')}>
                          {over && <AlertTriangle className="h-3.5 w-3.5" />}
                          {fmtDate(t.tatDueDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-indigo-500" style={{ width: `${t.completionPercentage}%` }} />
                          </div>
                          <span className="text-xs text-slate-400">{t.completionPercentage}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TaskFormModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['tasks'] })}
      />
    </div>
  );
}