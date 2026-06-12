'use client';

// AssignTaskDialog — opens when admin clicks "Assign" on a pending AI task.
//
// Form is pre-filled from the AI suggestion. Admin can edit any field before
// submitting. On submit:
//   1. Insert new row into public.tasks with source_session_id set
//   2. Update sessions.pending_ai_tasks → mark this entry status='assigned'
//      + record created_task_id
//
// Per Batch 3 Q3 decision: write to tasks table now. When Tasks module ships,
// these existing rows will already be there.

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, X, UserCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { aiTaskToRow, type PendingAiTask, type Session, type TaskPriority, TASK_PRIORITIES } from '@/types/session';

type Props = {
  session: Session;
  task: PendingAiTask;
  onClose: () => void;
  onAssigned: () => void;
};

function useAssignableUsers() {
  return useQuery({
    queryKey: ['users-for-assignee'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('users')
        .select('id, name, name_ar, role')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name');
      if (error) throw new Error(error.message);
      return data as { id: string; name: string; name_ar: string; role: string }[];
    },
  });
}

export function AssignTaskDialog({ session, task, onClose, onAssigned }: Props) {
  const { language, isRTL } = useLanguage();
  const { data: users = [] } = useAssignableUsers();

  // Editable form state, pre-filled from the AI suggestion
  const [title, setTitle] = useState(task.title);
  const [titleAr, setTitleAr] = useState(task.titleAr);
  const [description, setDescription] = useState(task.description);
  const [descriptionAr, setDescriptionAr] = useState(task.descriptionAr);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assigneeId, setAssigneeId] = useState<string>(task.suggestedAssigneeId ?? '');
  const [dueDate, setDueDate] = useState<string>(task.suggestedDueDate ?? '');

  const assign = useMutation({
    mutationFn: async () => {
      if (!assigneeId) throw new Error('assignee_required');
      if (!title.trim() || !titleAr.trim()) throw new Error('title_required');

      const supabase = createClient();

      // Get the caller's org for the task row
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('not_authenticated');
      const { data: me } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', authUser.id)
        .single();
      if (!me) throw new Error('user_lookup_failed');

      // 1. Insert into tasks table.
      // The tasks table schema (from 0001_schema.sql) has these columns we care
      // about: id, organization_id, title, title_ar, description, description_ar,
      // priority, assigned_to_id, due_date, status, source_session_id, created_by_id.
      // Some rork-era columns we leave at their defaults.
      const { data: insertedTask, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          organization_id: me.organization_id,
          title: title.trim(),
          title_ar: titleAr.trim(),
          description: description.trim() || null,
          description_ar: descriptionAr.trim() || null,
          priority,
          assigned_to_id: assigneeId,
          tat_due_date: dueDate ? new Date(dueDate).toISOString() : null,
          status: 'pending',
          source_session_id: session.id,
          created_by_id: authUser.id,
        })
        .select('id')
        .single();
      if (taskErr) throw new Error(`task_insert_failed: ${taskErr.message}`);
      const newTaskId = (insertedTask as { id: string }).id;

      // 2. Mark this AI suggestion as assigned in sessions.pending_ai_tasks
      const updated = session.pendingAiTasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: 'assigned' as const,
              resolvedAt: new Date(),
              resolvedById: authUser.id,
              createdTaskId: newTaskId,
              suggestedAssigneeId: assigneeId,
              suggestedDueDate: dueDate || null,
              title: title.trim(),
              titleAr: titleAr.trim(),
              description: description.trim(),
              descriptionAr: descriptionAr.trim(),
              priority,
            }
          : t
      );

      const { error: sessErr } = await supabase
        .from('sessions')
        .update({ pending_ai_tasks: updated.map(aiTaskToRow) })
        .eq('id', session.id);
      if (sessErr) throw new Error(`session_update_failed: ${sessErr.message}`);

      // 3. Audit log entry
      await supabase.from('session_edit_history').insert({
        session_id: session.id,
        edited_by_id: authUser.id,
        change_description: `AI task assigned: "${title.trim()}" → ${
          users.find((u) => u.id === assigneeId)?.name ?? 'user'
        }`,
        change_description_ar: `تم تعيين مهمة الذكاء الاصطناعي: "${titleAr.trim()}"`,
      });
    },
    onSuccess: () => onAssigned(),
  });

  const canSubmit =
    !!assigneeId && title.trim().length > 0 && titleAr.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 sm:p-4 overflow-y-auto"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-indigo-600" />
            <h3 className="text-base font-semibold">
              {language === 'ar' ? 'تعيين المهمة' : 'Assign task'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={assign.isPending}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-slate-500">
            {language === 'ar'
              ? 'راجع وعدل المهمة قبل التعيين. سيتم إنشاء مهمة في وحدة المهام مرتبطة بهذه الجلسة.'
              : 'Review and edit the task before assigning. A task will be created in the Tasks module linked to this session.'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-700">
                {language === 'ar' ? 'العنوان (EN)' : 'Title (EN)'} <span className="text-red-500">*</span>
              </label>
              <Input
                dir="ltr"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={assign.isPending}
              />
            </div>
            <div>
              <label className="text-xs text-slate-700">
                {language === 'ar' ? 'العنوان (AR)' : 'Title (AR)'} <span className="text-red-500">*</span>
              </label>
              <Input
                dir="rtl"
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                disabled={assign.isPending}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-700">
                {language === 'ar' ? 'الوصف (EN)' : 'Description (EN)'}
              </label>
              <textarea
                dir="ltr"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={assign.isPending}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
              />
            </div>
            <div>
              <label className="text-xs text-slate-700">
                {language === 'ar' ? 'الوصف (AR)' : 'Description (AR)'}
              </label>
              <textarea
                dir="rtl"
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                rows={3}
                disabled={assign.isPending}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-700">
                {language === 'ar' ? 'الأولوية' : 'Priority'}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                disabled={assign.isPending}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-700">
                {language === 'ar' ? 'تاريخ الاستحقاق' : 'Due date'}
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={assign.isPending}
                dir="ltr"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="text-xs text-slate-700">
                {language === 'ar' ? 'المسؤول' : 'Assignee'} <span className="text-red-500">*</span>
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={assign.isPending}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
              >
                <option value="">
                  {language === 'ar' ? '— اختر —' : '— Select —'}
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {language === 'ar' ? u.name_ar || u.name : u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {assign.isError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {(assign.error as Error)?.message}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <Button variant="outline" onClick={onClose} disabled={assign.isPending}>
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            onClick={() => assign.mutate()}
            disabled={!canSubmit || assign.isPending}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700"
          >
            {assign.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {language === 'ar' ? 'تعيين المهمة' : 'Assign task'}
          </Button>
        </div>
      </div>
    </div>
  );
}
