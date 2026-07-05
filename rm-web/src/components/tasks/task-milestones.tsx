'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Plus, Trash2, Check, ClipboardCheck, Send, ThumbsUp, ThumbsDown,
  AlertTriangle, ChevronRight, ChevronDown, CalendarClock, User, Edit, ArrowUp, ArrowDown,
} from 'lucide-react';
import { SubtaskTaskForce } from '@/components/tasks/subtask-task-force';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  listTaskMilestones, addTaskMilestone, toggleTaskMilestone, deleteTaskMilestone,
  addMilestoneSubtask, toggleMilestoneSubtask, deleteMilestoneSubtask, setMilestoneDueDate,
  submitClosure, approveClosure, rejectClosure, listUserNames, listDepartmentUserNames,
  setSubtaskOwner, acceptSubtaskSupport, declineSubtaskSupport, editTaskMilestone, editMilestoneSubtask,
  setMilestoneWeight, reorderMilestone,
} from '@/lib/tasks/queries';
import { milestoneProgress, milestoneOneProgress, weightsOutOfBalance, defaultWeight, type Task, type TaskMilestone } from '@/types/task';

const MILESTONE_COLORS = ['border-l-4 border-l-blue-400 bg-blue-50/30', 'border-l-4 border-l-green-400 bg-green-50/30', 'border-l-4 border-l-amber-400 bg-amber-50/30', 'border-l-4 border-l-purple-400 bg-purple-50/30', 'border-l-4 border-l-pink-400 bg-pink-50/30'];

function fmtDate(iso: string | null, ar: boolean): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(ar ? 'ar' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

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
  const [newDue, setNewDue] = useState('');
  const [statement, setStatement] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const msQ = useQuery({ queryKey: ['task-milestones', taskId], queryFn: () => listTaskMilestones(taskId) });
  const milestones = msQ.data ?? [];
  const progress = milestoneProgress(milestones);
  const refresh = () => qc.invalidateQueries({ queryKey: ['task-milestones', taskId] });

  const namesQ = useQuery({
    queryKey: ['user-names'],
    queryFn: listUserNames,
  });
  const nameOf = (id: string | null) => {
    if (!id) return ar ? 'غير معيّن' : 'Unassigned';
    return namesQ.data?.find((u) => u.id === id)?.[ar ? 'nameAr' : 'name'] ?? '—';
  };

  const ownerOptionsQ = useQuery({
    queryKey: ['dept-user-names', user?.id],
    queryFn: () => (user?.id ? listDepartmentUserNames(user.id) : Promise.resolve([])),
    enabled: !!user?.id,
  });

  const addM = useMutation({
    mutationFn: () => addTaskMilestone(taskId, newM, newMAr, newDue || null),
    onSuccess: () => { setNewM(''); setNewMAr(''); setNewDue(''); refresh(); },
  });

  const submit = useMutation({
    mutationFn: () => submitClosure(taskId, statement),
    onSuccess: () => { setStatement(''); refresh(); },
  });

  const approve = useMutation({
    mutationFn: () => approveClosure(taskId),
    onSuccess: () => refresh(),
  });

  const reject = useMutation({
    mutationFn: () => rejectClosure(taskId, rejectReason),
    onSuccess: () => { setRejectReason(''); setShowReject(false); refresh(); },
  });

  if (msQ.isLoading) return <div className="text-sm text-slate-500">{ar ? 'جاري التحميل…' : 'Loading…'}</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-sm font-medium text-slate-700">{progress}%</span>
      </div>

      {milestones.length === 0 ? (
        <p className="text-sm text-slate-500">
          {isAssignee && !isClosed ? (ar ? 'أضف مراحل لتتبع التقدم.' : 'Add milestones to track progress.') : ''}
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {milestones.map((m, idx) => (
            <MilestoneRow
              key={m.id}
              m={m}
              idx={idx}
              totalMs={milestones.length}
              taskId={taskId}
              isAssignee={isAssignee}
              isSuper={user?.role === 'super_admin'}
              isClosed={isClosed}
              ar={ar}
              nameOf={nameOf}
              users={namesQ.data ?? []}
              ownerOptions={ownerOptionsQ.data ?? []}
              currentUserId={user?.id ?? null}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}

      {isAssignee && !isClosed && (
        <div className="flex flex-col sm:flex-row gap-2 mb-1">
          <Input dir="ltr" placeholder={ar ? 'مرحلة جديدة (EN)' : 'New milestone (EN)'} value={newM} onChange={(e) => setNewM(e.target.value)} />
          <Input dir="rtl" placeholder={ar ? 'مرحلة جديدة (AR)' : 'New milestone (AR)'} value={newMAr} onChange={(e) => setNewMAr(e.target.value)} />
          <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="sm:w-40" />
          <Button onClick={() => addM.mutate()} disabled={!newM.trim() || addM.isPending} className="gap-1 bg-indigo-600 hover:bg-indigo-700 flex-shrink-0">
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
                <Button onClick={() => approve.mutate()} disabled={approve.isPending} className="gap-2 bg-green-600 hover:bg-green-700">
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
                  <Button onClick={() => reject.mutate()} disabled={!rejectReason.trim() || reject.isPending} className="gap-2 bg-red-600 hover:bg-red-700">
                    {reject.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {ar ? 'إرسال الرفض' : 'Send rejection'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowReject(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
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

function MilestoneRow({
  m, idx, totalMs, taskId, isAssignee, isSuper, isClosed, ar, nameOf, users, ownerOptions, currentUserId, onChanged,
}: {
  m: TaskMilestone;
  idx: number;
  totalMs: number;
  taskId: string;
  isAssignee: boolean;
  isSuper: boolean;
  isClosed: boolean;
  ar: boolean;
  nameOf: (id: string | null) => string;
  users: { id: string; name: string; nameAr: string }[];
  ownerOptions: { id: string; name: string; nameAr: string }[];
  currentUserId: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editMsTitle, setEditMsTitle] = useState(false);
  const [editMsEn, setEditMsEn] = useState(m.title);
  const [editMsAr, setEditMsAr] = useState(m.titleAr);
  const [subEn, setSubEn] = useState('');
  const [subAr, setSubAr] = useState('');
  const [subDue, setSubDue] = useState('');
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [editSubtask, setEditSubtask] = useState<{ id: string; title: string; titleAr: string } | null>(null);

  const pct = milestoneOneProgress(m);
  const hasSubs = m.subtasks.length > 0;
  const canManageSubs = (isAssignee || isSuper) && !isClosed;
  const colorClass = MILESTONE_COLORS[idx % MILESTONE_COLORS.length];
  const weight = m.weight ?? defaultWeight(totalMs);
  const isOutOfBalance = weightsOutOfBalance([m]);

  const toggleMs = useMutation({ mutationFn: (v: boolean) => toggleTaskMilestone(m.id, taskId, v), onSuccess: onChanged });
  const delMs = useMutation({ mutationFn: () => deleteTaskMilestone(m.id, taskId), onSuccess: onChanged });
  const editMsMut = useMutation({ mutationFn: () => editTaskMilestone(m.id, editMsEn, editMsAr, m.dueDate), onSuccess: () => { setEditMsTitle(false); onChanged(); } });
  const weightMut = useMutation({ mutationFn: (w: number | null) => setMilestoneWeight(m.id, taskId, w), onSuccess: onChanged });
  const reorderMut = useMutation({ mutationFn: (d: 'up' | 'down') => reorderMilestone(m.id, taskId, d), onSuccess: onChanged });

  const addSub = useMutation({ mutationFn: () => addMilestoneSubtask(m.id, taskId, subEn, subAr, subDue || null), onSuccess: () => { setSubEn(''); setSubAr(''); setSubDue(''); onChanged(); } });
  const toggleSub = useMutation({ mutationFn: (v: { id: string; done: boolean }) => toggleMilestoneSubtask(v.id, taskId, v.done), onSuccess: onChanged });
  const delSub = useMutation({ mutationFn: (id: string) => deleteMilestoneSubtask(id, taskId), onSuccess: onChanged });
  const dueMut = useMutation({ mutationFn: (d: string) => setMilestoneDueDate(m.id, d || null), onSuccess: onChanged });
  const editSubMut = useMutation({ mutationFn: (v: { id: string; title: string; titleAr: string; dueDate?: string | null }) => editMilestoneSubtask(v.id, v.title, v.titleAr, v.dueDate), onSuccess: () => { setEditSubtask(null); onChanged(); } });
  const ownerMut = useMutation({ mutationFn: (v: { id: string; ownerId: string }) => setSubtaskOwner(v.id, taskId, v.ownerId), onSuccess: onChanged });
  const acceptMut = useMutation({ mutationFn: (id: string) => acceptSubtaskSupport(id), onSuccess: onChanged });
  const declineMut = useMutation({ mutationFn: (v: { id: string; reason: string }) => declineSubtaskSupport(v.id, v.reason), onSuccess: () => { setDeclineFor(null); setDeclineReason(''); onChanged(); } });

  return (
    <li className={`rounded-md border border-slate-200 ${colorClass}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-600">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {!hasSubs ? (
          <button
            type="button"
            disabled={!isAssignee || isClosed || toggleMs.isPending}
            onClick={() => toggleMs.mutate(!m.isDone)}
            className={'h-5 w-5 flex-shrink-0 rounded border inline-flex items-center justify-center ' + (m.isDone ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white') + (!isAssignee || isClosed ? ' opacity-60 cursor-default' : '')}
          >
            {m.isDone && <Check className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="text-xs text-slate-400 w-9 text-center flex-shrink-0">{pct}%</span>
        )}
        <span className={'flex-1 text-sm ' + (pct === 100 ? 'text-slate-400 line-through' : 'text-slate-700')}>
          {ar ? m.titleAr || m.title : m.title}
        </span>
        <span className="hidden sm:flex items-center gap-1 text-xs text-slate-400">
          <User className="h-3 w-3" />
          {nameOf(m.assignedToId)}
        </span>
        <span className="hidden sm:flex items-center gap-1 text-xs text-slate-400">
          <CalendarClock className="h-3 w-3" />
          {fmtDate(m.dueDate, ar)}
        </span>
        {isAssignee && !isClosed && (
          <>
            <button type="button" onClick={() => { setEditMsTitle(true); setEditMsEn(m.title); setEditMsAr(m.titleAr); }} className="text-slate-300 hover:text-indigo-600">
              <Edit className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => delMs.mutate()} disabled={delMs.isPending} className="text-slate-300 hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
        {totalMs > 1 && isAssignee && !isClosed && (
          <>
            <button type="button" onClick={() => reorderMut.mutate('up')} disabled={idx === 0 || reorderMut.isPending} className="text-slate-300 hover:text-slate-600 disabled:opacity-50">
              <ArrowUp className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => reorderMut.mutate('down')} disabled={idx === totalMs - 1 || reorderMut.isPending} className="text-slate-300 hover:text-slate-600 disabled:opacity-50">
              <ArrowDown className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {hasSubs && (
        <div className="px-3 pb-2">
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {editMsTitle && (
        <div className="border-t border-slate-100 px-3 py-2 bg-slate-50/60 space-y-2">
          <label className="text-xs text-slate-600 block">{ar ? 'عنوان المرحلة' : 'Milestone title'}</label>
          <div className="flex gap-2">
            <Input dir="ltr" placeholder="EN" value={editMsEn} onChange={(e) => setEditMsEn(e.target.value)} className="text-sm" />
            <Input dir="rtl" placeholder="AR" value={editMsAr} onChange={(e) => setEditMsAr(e.target.value)} className="text-sm" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => editMsMut.mutate()} disabled={!editMsEn.trim() || editMsMut.isPending} className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700">
              {editMsMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {ar ? 'حفظ' : 'Save'}
            </Button>
            <Button variant="outline" onClick={() => setEditMsTitle(false)} className="h-7 text-xs">{ar ? 'إلغاء' : 'Cancel'}</Button>
          </div>
        </div>
      )}

      {open && (
        <div className="border-t border-slate-100 px-3 py-2 space-y-2 bg-slate-50/60">
          {isAssignee && !isClosed && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <CalendarClock className="h-3.5 w-3.5" />
              <span>{ar ? 'تاريخ الاستحقاق' : 'Due'}</span>
              <input
                type="date"
                defaultValue={m.dueDate ? m.dueDate.slice(0, 10) : ''}
                onChange={(e) => dueMut.mutate(e.target.value)}
                className="rounded border border-slate-200 px-2 py-1 text-xs"
              />
            </div>
          )}

          {isAssignee && !isClosed && (
            <div className="flex items-center gap-2 text-xs text-slate-500 p-2 rounded border border-slate-200 bg-white">
              <span>{ar ? 'وزن المرحلة' : 'Milestone weight'}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={weight}
                onChange={(e) => weightMut.mutate(e.target.value ? parseFloat(e.target.value) : null)}
                className="rounded border border-slate-200 px-2 py-1 text-xs w-16"
              />
              <span className="text-[11px] text-slate-400">/ 1.00</span>
            </div>
          )}

          {isOutOfBalance && (
            <div className="text-[11px] text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
              {ar ? 'تحذير: مجموع الأوزان لا يساوي 1.00' : 'Warning: weight sum ≠ 1.00'}
            </div>
          )}

          {m.subtasks.length === 0 ? (
            <p className="text-xs text-slate-400">{ar ? 'لا توجد مهام فرعية.' : 'No sub-tasks yet.'}</p>
          ) : (
            <ul className="space-y-1.5">
              {m.subtasks.map((s) => {
                const amOwner = currentUserId != null && currentUserId === s.assignedToId;
                const isRequested = s.supportStatus === 'requested';
                const isAccepted = s.supportStatus === 'accepted';
                const isDeclined = s.supportStatus === 'declined';
                const canTick = !isClosed && (s.supportStatus === null || isAccepted) && (isAssignee || isSuper);
                return editSubtask?.id === s.id ? (
                  <li key={s.id} className="rounded border border-slate-100 bg-white px-2 py-1.5 space-y-1">
                    <label className="text-xs text-slate-600">{ar ? 'عنوان المهمة الفرعية' : 'Sub-task title'}</label>
                    <div className="flex gap-2">
                      <Input dir="ltr" placeholder="EN" value={editSubtask.title} onChange={(e) => setEditSubtask({ ...editSubtask, title: e.target.value })} className="text-xs" />
                      <Input dir="rtl" placeholder="AR" value={editSubtask.titleAr} onChange={(e) => setEditSubtask({ ...editSubtask, titleAr: e.target.value })} className="text-xs" />
                    </div>
                    <label className="text-xs text-slate-600 block">{ar ? 'التاريخ' : 'Due date'}</label>
                    <input type="date" defaultValue={s.dueDate ?? ''} onChange={(e) => setEditSubtask({ ...editSubtask, dueDate: e.target.value })} className="rounded border border-slate-200 px-2 py-1 text-xs w-full" />
                    <div className="flex gap-1 pt-1">
                      <Button onClick={() => editSubMut.mutate({ id: s.id, title: editSubtask.title, titleAr: editSubtask.titleAr, dueDate: editSubtask.dueDate })} disabled={!editSubtask.title.trim() || editSubMut.isPending} className="h-6 text-xs bg-indigo-600 hover:bg-indigo-700">
                        {editSubMut.isPending ? <Loader2 className="h-2 w-2 animate-spin" /> : <Check className="h-3 w-3" />}
                      </Button>
                      <Button variant="outline" onClick={() => setEditSubtask(null)} className="h-6 text-xs">{ar ? 'إلغاء' : 'Cancel'}</Button>
                    </div>
                  </li>
                ) : (
                  <li key={s.id} className="rounded border border-slate-100 bg-white px-2 py-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <button
                        type="button"
                        disabled={!canTick}
                        onClick={() => toggleSub.mutate({ id: s.id, done: !s.isDone })}
                        className={'h-4 w-4 flex-shrink-0 rounded border inline-flex items-center justify-center ' + (s.isDone ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white') + (!canTick ? ' opacity-60 cursor-default' : '')}
                      >
                        {s.isDone && <Check className="h-3 w-3" />}
                      </button>
                      <span className={'flex-1 ' + (s.isDone ? 'text-slate-400 line-through' : 'text-slate-600')}>
                        {ar ? s.titleAr || s.title : s.title}
                      </span>
                      {isRequested && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">{ar ? 'دعم' : 'SUPPORT'}</span>}
                      {isAccepted && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 flex-shrink-0">{ar ? 'دعم ✓' : 'SUPPORT ✓'}</span>}
                      {isDeclined && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex-shrink-0">{ar ? 'دعم ✕' : 'SUPPORT ✕'}</span>}
                      <span className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 flex-shrink-0"><User className="h-3 w-3" />{nameOf(s.assignedToId)}</span>
                      {s.dueDate && <span className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 flex-shrink-0"><CalendarClock className="h-3 w-3" />{fmtDate(s.dueDate, ar)}</span>}
                      {canManageSubs && (
                        <>
                          <button type="button" onClick={() => setEditSubtask({ id: s.id, title: s.title, titleAr: s.titleAr, dueDate: s.dueDate ?? undefined })} className="text-slate-300 hover:text-indigo-600 flex-shrink-0">
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => delSub.mutate(s.id)} className="text-slate-300 hover:text-red-500 flex-shrink-0">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                    {canManageSubs && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-[11px] text-slate-400">{ar ? 'مُسند إلى' : 'Owner'}</span>
                        <select
                          value={s.assignedToId ?? ''}
                          onChange={(e) => ownerMut.mutate({ id: s.id, ownerId: e.target.value })}
                          disabled={ownerMut.isPending || s.supportStatus === 'requested' || s.supportStatus === 'accepted'}
                          className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] bg-white"
                        >
                          <option value="">{ar ? 'غير معيّن' : 'Unassigned'}</option>
                          {(() => { const opts = [...ownerOptions]; if (s.assignedToId && !opts.some((u) => u.id === s.assignedToId)) { const cur = users.find((u) => u.id === s.assignedToId); if (cur) opts.push(cur); } return opts.map((u) => <option key={u.id} value={u.id}>{ar ? u.nameAr || u.name : u.name}</option>); })()}
                        </select>
                      </div>
                    )}
                    <SubtaskTaskForce subtaskId={s.id} taskId={taskId} canRequest={isAssignee && !isSuper} />
                    {isDeclined && s.supportDeclineReason && <p className="mt-1 text-[11px] text-red-600">{ar ? 'رُفض الدعم: ' : 'Support declined: '}{s.supportDeclineReason}</p>}
                    {isRequested && amOwner && (declineFor === s.id ? (
                      <div className="mt-1 space-y-1">
                        <textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} rows={2} placeholder={ar ? 'سبب الرفض (مطلوب)' : 'Reason for declining (required)'} className="w-full rounded border border-slate-200 px-2 py-1 text-xs" />
                        <div className="flex gap-1"><Button onClick={() => declineMut.mutate({ id: s.id, reason: declineReason })} disabled={!declineReason.trim() || declineMut.isPending} className="h-7 text-xs bg-red-600 hover:bg-red-700">{ar ? 'تأكيد الرفض' : 'Confirm decline'}</Button><Button variant="outline" onClick={() => { setDeclineFor(null); setDeclineReason(''); }} className="h-7 text-xs">{ar ? 'إلغاء' : 'Cancel'}</Button></div>
                      </div>
                    ) : (
                      <div className="mt-1 flex gap-1"><Button onClick={() => acceptMut.mutate(s.id)} disabled={acceptMut.isPending} className="h-7 text-xs bg-green-600 hover:bg-green-700 gap-1">{acceptMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}{ar ? 'قبول الدعم' : 'Accept support'}</Button><Button variant="outline" onClick={() => setDeclineFor(s.id)} className="h-7 text-xs">{ar ? 'رفض' : 'Decline'}</Button></div>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
          {canManageSubs && (
            <div className="flex flex-col sm:flex-row gap-2">
              <Input dir="ltr" placeholder={ar ? 'مهمة فرعية (EN)' : 'Sub-task (EN)'} value={subEn} onChange={(e) => setSubEn(e.target.value)} className="h-8 text-sm" />
              <Input dir="rtl" placeholder={ar ? 'مهمة فرعية (AR)' : 'Sub-task (AR)'} value={subAr} onChange={(e) => setSubAr(e.target.value)} className="h-8 text-sm" />
              <Input type="date" value={subDue} onChange={(e) => setSubDue(e.target.value)} className="h-8 text-sm sm:w-40" />
              <Button onClick={() => addSub.mutate()} disabled={!subEn.trim() || addSub.isPending} className="h-8 gap-1 bg-indigo-600 hover:bg-indigo-700 flex-shrink-0">
                {addSub.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {ar ? 'إضافة' : 'Add'}
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
