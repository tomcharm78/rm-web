'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, X, Pencil } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateTask, listTaskDomains, listSubDomains } from '@/lib/tasks/queries';
import type { Task, TaskPriority } from '@/types/task';

const PRIORITIES: { value: TaskPriority; en: string; ar: string }[] = [
  { value: 'low', en: 'Low', ar: 'منخفضة' },
  { value: 'medium', en: 'Medium', ar: 'متوسطة' },
  { value: 'high', en: 'High', ar: 'عالية' },
  { value: 'critical', en: 'Critical', ar: 'حرجة' },
];

function isoToDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function TaskEditModal({
  task,
  open,
  onClose,
}: {
  task: Task;
  open: boolean;
  onClose: () => void;
}) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const [title, setTitle] = useState(task.title);
  const [titleAr, setTitleAr] = useState(task.titleAr);
  const [description, setDescription] = useState(task.description);
  const [descriptionAr, setDescriptionAr] = useState(task.descriptionAr);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [domainId, setDomainId] = useState(task.domainId);
  const [subDomainId, setSubDomainId] = useState(task.subDomainId ?? '');
  const [dueDate, setDueDate] = useState(isoToDateInput(task.tatDueDate));
  const [formError, setFormError] = useState('');

  const domainsQ = useQuery({ queryKey: ['task-domains'], queryFn: listTaskDomains, enabled: open });
  const subDomainsQ = useQuery({
    queryKey: ['sub-domains', domainId],
    queryFn: () => listSubDomains(domainId),
    enabled: open && !!domainId,
  });

  const save = useMutation({
    mutationFn: () =>
      updateTask(task.id, {
        title,
        titleAr,
        description,
        descriptionAr,
        priority,
        domainId,
        subDomainId: subDomainId || null,
        assignedToId: task.assignedToId,
        tatDueDate: new Date(dueDate).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', task.id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
  });

  const submit = () => {
    setFormError('');
    // Only the ACTIVE language's title is required.
    if (ar ? !titleAr.trim() : !title.trim()) {
      setFormError(ar ? 'العنوان مطلوب' : 'Title is required');
      return;
    }
    if (!domainId) {
      setFormError(ar ? 'اختر المجال' : 'Select a domain');
      return;
    }
    if (!dueDate) {
      setFormError(ar ? 'تاريخ الاستحقاق مطلوب' : 'Due date is required');
      return;
    }
    save.mutate();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Pencil className="h-4 w-4 text-indigo-600" />
            {ar ? 'تعديل المهمة' : 'Edit Task'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ONE field, matching the create form — writes to the column for the
              user's language. Editing in Arabic edits the Arabic title, which is
              how a task gradually gains both versions as people work. */}
          <div>
            <Label>{ar ? 'العنوان' : 'Title'} *</Label>
            <Input
              dir={ar ? 'rtl' : 'ltr'}
              value={ar ? titleAr : title}
              onChange={(e) => (ar ? setTitleAr(e.target.value) : setTitle(e.target.value))}
              className="mt-1"
            />
          </div>

          <div>
            <Label>{ar ? 'الوصف' : 'Description'}</Label>
            <textarea
              dir={ar ? 'rtl' : 'ltr'}
              rows={2}
              value={ar ? descriptionAr : description}
              onChange={(e) => (ar ? setDescriptionAr(e.target.value) : setDescription(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{ar ? 'الأولوية' : 'Priority'}</Label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{ar ? p.ar : p.en}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>{ar ? 'تاريخ الاستحقاق' : 'Due date'} *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{ar ? 'المجال' : 'Domain'} *</Label>
              <select value={domainId} onChange={(e) => { setDomainId(e.target.value); setSubDomainId(''); }}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
                <option value="">{ar ? 'اختر المجال' : 'Select a domain'}</option>
                {(domainsQ.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{ar ? d.nameAr || d.name : d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>{ar ? 'المجال الفرعي (اختياري)' : 'Sub-domain (optional)'}</Label>
              <select value={subDomainId} onChange={(e) => setSubDomainId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
                <option value="">{ar ? 'بدون' : 'None'}</option>
                {(subDomainsQ.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{ar ? s.nameAr || s.name : s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {(formError || save.isError) && (
            <p className="text-sm text-red-600">{formError || (save.error as Error)?.message}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {ar ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={submit} disabled={save.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            {ar ? 'حفظ التغييرات' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}