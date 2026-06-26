'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Building2, Check, X } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { getMyOrgContext, updateDeputyshipName } from '@/lib/org/queries';
import { AttachmentsToggle } from '@/components/attachments/attachments-toggle';

export default function DashboardHomePage() {
  const { user, isInitialized } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const ctxQ = useQuery({
    queryKey: ['my-org-context'],
    queryFn: getMyOrgContext,
    enabled: isInitialized && !!user,
  });
  const ctx = ctxQ.data;

  const [editing, setEditing] = useState(false);
  const [depName, setDepName] = useState('');
  const [depNameAr, setDepNameAr] = useState('');

  const saveDep = useMutation({
    mutationFn: () => updateDeputyshipName(depName, depNameAr),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['my-org-context'] });
    },
  });

  if (!isInitialized) return <div className="p-8 text-muted-foreground">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>;
  if (!user) return null;

  const isSuper = user.role === 'super_admin';
  const deputyship = ctx ? (ar ? ctx.orgNameAr || ctx.orgName : ctx.orgName) : '—';
  const departmentLabel = ctx
    ? ((ar ? ctx.departmentNameAr || ctx.departmentName : ctx.departmentName) || deputyship)
    : '—';
  const reportsTo = ctx ? ((ar ? ctx.reportsToNameAr || ctx.reportsToName : ctx.reportsToName) || '—') : '—';

  const startEdit = () => {
    setDepName(ctx?.orgName ?? '');
    setDepNameAr(ctx?.orgNameAr ?? '');
    setEditing(true);
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="bg-white rounded-lg border p-5 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-600" />
            <div>
              <div className="text-xs text-muted-foreground">{ar ? 'الوكالة' : 'Deputyship'}</div>
              {!editing ? (
                <div className="text-lg font-semibold">{deputyship}</div>
              ) : (
                <div className="mt-1 space-y-2">
                  <input value={depName} onChange={(e) => setDepName(e.target.value)} placeholder="Name (EN)"
                    className="block w-72 rounded border border-slate-200 px-2 py-1 text-sm" />
                  <input value={depNameAr} onChange={(e) => setDepNameAr(e.target.value)} placeholder="الاسم (AR)" dir="rtl"
                    className="block w-72 rounded border border-slate-200 px-2 py-1 text-sm" />
                </div>
              )}
            </div>
          </div>
          {isSuper && !editing && (
            <button type="button" onClick={startEdit} className="text-slate-400 hover:text-slate-700">
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {isSuper && editing && (
            <div className="flex gap-1">
              <button type="button" onClick={() => saveDep.mutate()}
                disabled={saveDep.isPending || !depName.trim() || !depNameAr.trim()}
                className="rounded bg-indigo-600 text-white p-1.5 disabled:opacity-50">
                <Check className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setEditing(false)} className="rounded border border-slate-200 p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border p-8">
        <h2 className="text-2xl font-semibold mb-2">{ar ? `مرحبًا، ${user.name}!` : `Welcome, ${user.name}!`}</h2>
        <p className="text-muted-foreground mb-6">
          {ar ? 'تتم إضافة وحدات التطبيق تدريجيًا من هنا.' : 'The rest of the app is built module by module from here.'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 text-sm">
          <div className="space-y-1">
            <div className="text-muted-foreground">{ar ? 'البريد' : 'Email'}</div>
            <div className="font-medium">{user.email}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">{ar ? 'الدور' : 'Role'}</div>
            <div className="font-medium">{user.role}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">{ar ? 'القسم' : 'Department'}</div>
            <div className="font-medium">{departmentLabel}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">{ar ? 'يتبع لـ' : 'Reports to'}</div>
            <div className="font-medium">{reportsTo}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">{ar ? 'الصلاحيات' : 'Permissions'}</div>
            <div className="font-medium">{user.permissions.length} {ar ? 'مُمنوحة' : 'granted'}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">{ar ? 'آخر دخول' : 'Last login'}</div>
            <div className="font-medium">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}</div>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <AttachmentsToggle />
      </div>
    </div>
  );
}