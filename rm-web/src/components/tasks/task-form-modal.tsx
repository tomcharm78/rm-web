'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, X, Plus } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createTask,
  listTaskDomains,
  listSubDomains,
  listAssignableUsers,
  listUserDomains,
} from '@/lib/tasks/queries';
import type { TaskPriority } from '@/types/task';

const PRIORITIES: { value: TaskPriority; en: string; ar: string }[] = [
  { value: 'low', en: 'Low', ar: 'منخفضة' },
  { value: 'medium', en: 'Medium', ar: 'متوسطة' },
  { value: 'high', en: 'High', ar: 'عالية' },
  { value: 'critical', en: 'Critical', ar: 'حرجة' },
];

export function TaskFormModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [domainId, setDomainId] = useState('');
  const [subDomainId, setSubDomainId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (open && !isAdmin && user?.id) setAssignedToId(user.id);
  }, [open, isAdmin, user?.id]);

  const allDomainsQ = useQuery({ queryKey: ['task-domains'], queryFn: listTaskDomains, enabled: open });
  const assignableQ = useQuery({
    queryKey: ['assignable-users', assigneeFilter],
    queryFn: () => listAssignableUsers(assigneeFilter || undefined),
    enabled: open && isAdmin,
  });
  const userDomainsQ = useQuery({
    queryKey: ['user-domains', assignedToId],
    queryFn: () => listUserDomains(assignedToId),
    enabled: open && !!assignedToId,
  });
  const subDomainsQ = useQuery({
    queryKey: ['sub-domains', domainId],
    queryFn: () => listSubDomains(domainId),
    enabled: open && !!domainId,
  });

  const userDomains = userDomainsQ.data ?? [];

  useEffect(() => {
    if (userDomainsQ.isSuccess && userDomains.length === 1) setDomainId(userDomains[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDomainsQ.isSuccess, assignedToId]);

  const changeAssignee = (id: string) => {
    setAssignedToId(id);
    setDomainId('');
    setSubDomainId('');
  };

  const reset = () => {
    setTitle('');
    setTitleAr('');
    setDescription('');
    setDescriptionAr('');
    setPriority('medium');
    setAssigneeFilter('');
    setAssignedToId('');
    setDomainId('');
    setSubDomainId('');
    setDueDate('');
    setFormError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const create = useMutation({
    mutationFn: () =>
      createTask({
        title,
        titleAr,
        description,
        descriptionAr,
        priority,
        domainId,
        subDomainId: subDomainId || null,
        assignedToId,
        tatDueDate: new Date(dueDate).toISOString(),
      }),
    onSuccess: () => {
      onCreated();
      reset();
      onClose();
    },
  });

  const submit = () => {
    setFormError('');
    if (!title.trim() || !titleAr.trim()) {
      setFormError(ar ? 'العنوان مطلوب بالعربية والإنجليزية' : 'Title is required in both English and Arabic');
      return;
    }
    if (!assignedToId) {
      setFormError(ar ? 'اختر المكلَّف' : 'Select an assignee');
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
    create.mutate();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4 text-indigo-600" />
            {ar ? 'إضافة مهمة' : 'Add Task'}
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{ar ? 'العنوان (إنجليزي)' : 'Title (EN)'} *</Label>
              <Input dir="ltr" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>{ar ? 'العنوان (عربي)' : 'Title (AR)'} *</Label>
              <Input dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{ar ? 'الوصف (إنجليزي)' : 'Description (EN)'}</Label>
              <textarea
                dir="ltr"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <Label>{ar ? 'الوصف (عربي)' : 'Description (AR)'}</Label>
              <textarea
                dir="rtl"
                rows={2}
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{ar ? 'الأولوية' : 'Priority'}</Label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {ar ? p.ar : p.en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{ar ? 'تاريخ الاستحقاق' : 'Due date'} *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>{ar ? 'المكلَّف' : 'Assignee'} *</Label>
            {!isAdmin ? (
              <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {user?.name} <span className="text-slate-400">({ar ? 'أنت' : 'you'})</span>
              </div>
            ) : (
              <div className="mt-1 space-y-2">
                <select
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">{ar ? 'كل المجالات (تصفية اختيارية)' : 'All domains (optional filter)'}</option>
                  {(allDomainsQ.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {ar ? d.nameAr || d.name : d.name}
                    </option>
                  ))}
                </select>
                <select
                  value={assignedToId}
                  onChange={(e) => changeAssignee(e.target.value)}
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
              </div>
            )}
          </div>

          <div>
            <Label>{ar ? 'المجال' : 'Domain'} *</Label>
            {!assignedToId ? (
              <div className="mt-1 text-xs text-slate-400">{ar ? 'اختر المكلَّف أولًا' : 'Select an assignee first'}</div>
            ) : userDomainsQ.isLoading ? (
              <div className="mt-1">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            ) : userDomains.length === 1 ? (
              <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {ar ? userDomains[0].nameAr || userDomains[0].name : userDomains[0].name}
              </div>
            ) : userDomains.length > 1 ? (
              <select
                value={domainId}
                onChange={(e) => {
                  setDomainId(e.target.value);
                  setSubDomainId('');
                }}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="">{ar ? 'اختر المجال' : 'Select a domain'}</option>
                {userDomains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {ar ? d.nameAr || d.name : d.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-1">
                <select
                  value={domainId}
                  onChange={(e) => {
                    setDomainId(e.target.value);
                    setSubDomainId('');
                  }}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">{ar ? 'اختر المجال' : 'Select a domain'}</option>
                  {(allDomainsQ.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {ar ? d.nameAr || d.name : d.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-amber-600 mt-1">
                  {ar ? 'لا يوجد مجال محدد لهذا الشخص — اختر واحدًا.' : 'No domain set for this person — pick one.'}
                </p>
              </div>
            )}
          </div>

          {domainId && (
            <div>
              <Label>{ar ? 'المجال الفرعي (اختياري)' : 'Sub-domain (optional)'}</Label>
              <select
                value={subDomainId}
                onChange={(e) => setSubDomainId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="">{ar ? 'بدون' : 'None'}</option>
                {(subDomainsQ.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {ar ? s.nameAr || s.name : s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(formError || create.isError) && (
            <p className="text-sm text-red-600">{formError || (create.error as Error)?.message}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <Button variant="outline" onClick={handleClose} disabled={create.isPending}>
            {ar ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={submit} disabled={create.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {ar ? 'إنشاء المهمة' : 'Create task'}
          </Button>
        </div>
      </div>
    </div>
  );
}