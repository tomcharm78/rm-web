'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserCog, Pencil, Trash2, X } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { reassignTask, softDeleteTask, listAssignableUsers } from '@/lib/tasks/queries';
import { TaskEditModal } from '@/components/tasks/task-edit-modal';
import type { Task } from '@/types/task';

export function TaskActions({ task }: { task: Task }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();
  const router = useRouter();

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuper = user?.role === 'super_admin';

  const [showReassign, setShowReassign] = useState(false);
  const [newAssignee, setNewAssignee] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const assignableQ = useQuery({
    queryKey: ['assignable-users', 'reassign'],
    queryFn: () => listAssignableUsers(),
    enabled: showReassign,
  });

  const reassign = useMutation({
    mutationFn: () => reassignTask(task.id, newAssignee),
    onSuccess: () => {
      setShowReassign(false);
      setNewAssignee('');
      qc.invalidateQueries({ queryKey: ['task-milestones', task.id] });
      qc.invalidateQueries({ queryKey: ['task', task.id] });
      qc.invalidateQueries({ queryKey: ['task-history', task.id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const del = useMutation({
    mutationFn: () => softDeleteTask(task.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      router.push('/tasks');
    },
  });

  if (!isAdmin) return null;

  return (
    <div className="flex items-center gap-2 mb-4">
      <Button variant="outline" onClick={() => setShowReassign(true)} className="gap-2">
        <UserCog className="h-4 w-4" />
        {ar ? 'إعادة تعيين' : 'Reassign'}
      </Button>
      <Button variant="outline" onClick={() => setShowEdit(true)} className="gap-2">
        <Pencil className="h-4 w-4" />
        {ar ? 'تعديل' : 'Edit'}
      </Button>

      {isSuper && (
        <Button
          variant="outline"
          onClick={() => setConfirmDelete(true)}
          className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          {ar ? 'حذف' : 'Delete'}
        </Button>
      )}

      {showReassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowReassign(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{ar ? 'إعادة تعيين المهمة' : 'Reassign task'}</h3>
              <button onClick={() => setShowReassign(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-2">
              {ar ? 'سيبدأ المكلَّف الجديد بقبول المهمة من جديد.' : 'The new assignee starts with a fresh Accept.'}
            </p>
            <select
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">
                {assignableQ.isLoading ? (ar ? 'جارٍ التحميل…' : 'Loading…') : ar ? 'اختر شخصًا' : 'Select a person'}
              </option>
              {(assignableQ.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {(ar ? u.nameAr || u.name : u.name)} — {u.role}
                </option>
              ))}
            </select>
            {reassign.isError && <p className="text-xs text-red-600 mt-2">{(reassign.error as Error)?.message}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowReassign(false)} disabled={reassign.isPending}>
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                onClick={() => reassign.mutate()}
                disabled={!newAssignee || reassign.isPending}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                {reassign.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {ar ? 'تعيين' : 'Reassign'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-red-700 mb-2">{ar ? 'حذف المهمة؟' : 'Delete this task?'}</h3>
            <p className="text-sm text-slate-600 mb-4">
              {ar
                ? 'سيُزال من جميع القوائم. لا يمكن التراجع عن ذلك من الواجهة.'
                : 'This removes the task from all lists. It cannot be undone from the UI.'}
            </p>
            {del.isError && <p className="text-xs text-red-600 mb-2">{(del.error as Error)?.message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={del.isPending}>
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={() => del.mutate()} disabled={del.isPending} className="gap-2 bg-red-600 hover:bg-red-700">
                {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {ar ? 'حذف' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    {showEdit && (
        <TaskEditModal task={task} open onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}