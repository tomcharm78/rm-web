'use client';

// MemberFormModal — add or edit a member.
//
// Create: POSTs to /api/users/create (server route) which makes the auth
//   account + users row, then returns a temp password to relay.
// Edit: calls updateMember (name/role/permissions/domains/admin/active). Email
//   is the login identity and is read-only on edit.
//
// Permission toggles: picking a role pre-fills ROLE_DEFAULT_PERMISSIONS; each
// toggle is individually overridable. super_admin is all-on and locked.

import { useEffect, useState } from 'react';
import { listDepartments } from '@/lib/tasks/queries';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X, UserPlus, KeyRound, Copy, Check } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  updateMember,
  listDomains,
  listAssignableAdmins, 
  listAssignableSupers,
  listAssignablePmos,
  listHigherManagement,
  type Member,
} from '@/lib/users/queries';
import {
  ALL_PERMISSIONS,
  ADMIN_ASSIGNABLE_ROLES,
  SUPER_ADMIN_ASSIGNABLE_ROLES,
  PMO_ASSIGNABLE_ROLES,
  ROLE_LABELS,
  PERMISSION_LABELS,
  ROLE_DEFAULT_PERMISSIONS,
  type MemberFormInput,
} from '@/lib/users/constants';
import type { UserRole, UserPermission } from '@/types';

type Props = {
  member: Member | null; // null = create, otherwise edit
  onClose: () => void;
  onSaved: () => void;
};

const FIELD_CLS =
  'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1';

export function MemberFormModal({ member, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const { language, isRTL } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();
  const isEdit = !!member;

  const assignableRoles = (
    user?.role === 'super_admin'
      ? SUPER_ADMIN_ASSIGNABLE_ROLES
      : user?.role === 'pmo'
      ? PMO_ASSIGNABLE_ROLES
      : ADMIN_ASSIGNABLE_ROLES
  ) as UserRole[];

  const [name, setName] = useState(member?.name ?? '');
  const [nameAr, setNameAr] = useState(member?.nameAr ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [role, setRole] = useState<UserRole>(member?.role ?? assignableRoles[0]);
  const [permissions, setPermissions] = useState<UserPermission[]>(
    member?.permissions ?? ROLE_DEFAULT_PERMISSIONS[member?.role ?? assignableRoles[0]]
  );
  const [adminId, setAdminId] = useState<string | null>(member?.adminId ?? null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [pmDepartmentIds, setPmDepartmentIds] = useState<string[]>(member?.pmDepartmentIds ?? []);
  const [useNewDept, setUseNewDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptNameAr, setNewDeptNameAr] = useState('');
  const [domainIds, setDomainIds] = useState<string[]>(member?.domainIds ?? []);
  const [isActive, setIsActive] = useState<boolean>(member?.isActive ?? true);

  const [tempCredentials, setTempCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const domainsQ = useQuery({ queryKey: ['domains'], queryFn: listDomains });
  const adminsQ = useQuery({
    queryKey: ['assignable-admins'],
    queryFn: listAssignableAdmins,
  });
  const domains = domainsQ.data ?? [];
  const admins = adminsQ.data ?? []; 
  const supersQ = useQuery({ queryKey: ['assignable-supers'], queryFn: listAssignableSupers });
  const supers = supersQ.data ?? [];
  const pmosQ = useQuery({ queryKey: ['assignable-pmos'], queryFn: listAssignablePmos });
  const pmos = pmosQ.data ?? [];
  const togglePmDept = (id: string) =>
    setPmDepartmentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const higherMgmtQ = useQuery({ queryKey: ['higher-management'], queryFn: listHigherManagement });
  const higherMgmt = higherMgmtQ.data ?? [];
  const departmentsQ = useQuery({
    queryKey: ['departments-list'],
    queryFn: listDepartments,
  });
  const departments = departmentsQ.data ?? [];

  const isSuperRole = role === 'super_admin';
  const isEditingHM = !!(member as { isHigherManagement?: boolean } | undefined)?.isHigherManagement;

  // When role changes, re-apply that role's default permissions.
  useEffect(() => {
    setPermissions(ROLE_DEFAULT_PERMISSIONS[role]);
  }, [role]);

  const togglePermission = (p: UserPermission) => {
    if (isSuperRole) return; // locked all-on
    setPermissions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };
  const toggleDomain = (id: string) => {
    setDomainIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const formInput = (): MemberFormInput => ({
    name: name.trim(),
    nameAr: nameAr.trim(),
    email: email.trim().toLowerCase(),
    role,
    permissions: isSuperRole ? [...ALL_PERMISSIONS] : permissions,
    adminId,
    domainIds,
    avatar: member?.avatar ?? null,
    isActive,
    departmentId: useNewDept ? null : departmentId,
    newDepartmentName: useNewDept ? newDeptName.trim() : undefined,
    newDepartmentNameAr: useNewDept ? newDeptNameAr.trim() : undefined,
    pmDepartmentIds: role === 'pm' ? pmDepartmentIds : undefined,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !nameAr.trim()) {
        throw new Error(ar ? 'الاسم مطلوب' : 'Name is required');
      }
      if (!isEdit && !email.trim()) {
        throw new Error(ar ? 'البريد مطلوب' : 'Email is required');
      }
      if ((role === 'admin' || role === 'pmo' || role === 'pm' || (role === 'super_admin' && !isEditingHM)) && !adminId) {
        throw new Error(ar ? 'يجب اختيار جهة يتبع لها' : 'A reports-to is required');
      }
      if (!isEdit && role === 'admin') {
        const hasExisting = !useNewDept && !!departmentId;
        const hasNew =
          useNewDept && !!newDeptName.trim() && !!newDeptNameAr.trim();
        if (!hasExisting && !hasNew) {
          throw new Error(
            ar ? 'القسم مطلوب للمسؤول' : 'Department is required for an admin'
          );
        }
      }

      if (isEdit) {
        await updateMember(member!.id, formInput());
        return { mode: 'edit' as const };
      }

      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formInput()),
      });
      const data = await res.json();
      if (!res.ok) {
        const map: Record<string, string> = {
          email_exists: ar ? 'البريد مستخدم بالفعل' : 'That email is already registered',
          role_not_allowed: ar
            ? 'لا تملك صلاحية لهذا الدور'
            : 'You are not allowed to assign that role',
          forbidden: ar ? 'غير مصرح' : 'Not permitted',
          service_role_not_configured: ar
            ? 'مفتاح الخدمة غير مهيأ'
            : 'Server key not configured',
        };
        const msg = map[data?.error] ?? data?.message ?? data?.error ?? 'create_failed';
        throw new Error(msg);
      }
      return {
        mode: 'create' as const,
        email: data.email as string,
        password: data.tempPassword as string,
      };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['members'] });
      if (result.mode === 'create') {
        setTempCredentials({ email: result.email, password: result.password });
      } else {
        onSaved();
      }
    },
  });

  const copyCredentials = async () => {
    if (!tempCredentials) return;
    const emailLabel = ar ? 'البريد' : 'Email';
    const passLabel = ar ? 'كلمة المرور المؤقتة' : 'Temp password';
    await navigator.clipboard.writeText(
      `${emailLabel}: ${tempCredentials.email}\n${passLabel}: ${tempCredentials.password}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canSubmit = name.trim() && nameAr.trim() && (isEdit || email.trim());

  // ---- Success screen: show temp credentials after a create ----
  if (tempCredentials) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 sm:p-4 overflow-y-auto"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md my-4">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200">
            <KeyRound className="h-4 w-4 text-green-600" />
            <h3 className="text-base font-semibold">
              {ar ? 'تم إنشاء العضو' : 'Member created'}
            </h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-sm text-slate-600">
              {ar
                ? 'شارك بيانات الدخول المؤقتة مع العضو. سيُطلب منه تغيير كلمة المرور عند أول دخول.'
                : 'Share these temporary credentials with the member. They will be asked to change the password on first login.'}
            </p>
            <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-sm font-mono break-all">
              <div>
                <span className="text-slate-400">{ar ? 'البريد: ' : 'Email: '}</span>
                {tempCredentials.email}
              </div>
              <div>
                <span className="text-slate-400">{ar ? 'كلمة المرور: ' : 'Password: '}</span>
                {tempCredentials.password}
              </div>
            </div>
            <Button onClick={copyCredentials} variant="outline" className="gap-2 w-full">
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied
                ? ar
                  ? 'تم النسخ'
                  : 'Copied'
                : ar
                ? 'نسخ البيانات'
                : 'Copy credentials'}
            </Button>
          </div>
          <div className="flex justify-end px-5 py-3 border-t border-slate-200 bg-slate-50">
            <Button onClick={onSaved} className="bg-indigo-600 hover:bg-indigo-700">
              {ar ? 'تم' : 'Done'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 sm:p-4 overflow-y-auto"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-indigo-600" />
            <h3 className="text-base font-semibold">
              {isEdit
                ? ar
                  ? 'تعديل العضو'
                  : 'Edit member'
                : ar
                ? 'إضافة عضو'
                : 'Add member'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-700">
                {ar ? 'الاسم (EN)' : 'Name (EN)'} <span className="text-red-500">*</span>
              </label>
              <Input
                dir="ltr"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={save.isPending}
              />
            </div>
            <div>
              <label className="text-xs text-slate-700">
                {ar ? 'الاسم (AR)' : 'Name (AR)'} <span className="text-red-500">*</span>
              </label>
              <Input
                dir="rtl"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                disabled={save.isPending}
              />
            </div>
          </div>

          {/* Email + Role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-700">
                {ar ? 'البريد الإلكتروني' : 'Email'}{' '}
                {!isEdit && <span className="text-red-500">*</span>}
              </label>
              <Input
                dir="ltr"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isEdit || save.isPending}
                className={isEdit ? 'bg-slate-50 text-slate-500' : ''}
              />
              {isEdit && (
                <p className="text-[11px] text-slate-400 mt-1">
                  {ar
                    ? 'البريد هو معرّف الدخول ولا يمكن تغييره هنا.'
                    : 'Email is the login identity and cannot be changed here.'}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-700">{ar ? 'الدور' : 'Role'}</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={save.isPending}
                className={FIELD_CLS}
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r][ar ? 'ar' : 'en']}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reports to */}
          <div>
            <label className="text-xs text-slate-700">
              {role === 'super_admin' ? (ar ? 'يتبع لـ (الإدارة العليا) *' : 'Reports to (Higher Management) *') : role === 'pmo' ? (ar ? 'يتبع لـ (مدير عام) *' : 'Reports to (super-admin) *') : role === 'pm' ? (ar ? 'يتبع لـ (مسؤول إدارة المشاريع) *' : 'Reports to (PMO) *') : role === 'admin' ? (ar ? 'يتبع لـ (مدير عام) *' : 'Reports to (super-admin) *') : (ar ? 'يتبع لـ (مدير)' : 'Reports to (admin)')}
            </label>
            <select
              value={adminId ?? ''}
              onChange={(e) => setAdminId(e.target.value || null)}
              disabled={save.isPending}
              className={FIELD_CLS}
            >
              <option value="">{ar ? '— لا أحد —' : '— None —'}</option>
              {(role === 'super_admin' ? higherMgmt : role === 'pmo' ? supers : role === 'pm' ? pmos : role === 'admin' ? supers : admins).map((a) => (
                <option key={a.id} value={a.id}>
                  {ar ? a.nameAr || a.name : a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Department (admins only, on create) */}
          {role === 'admin' && !isEdit && (
            <div>
              <label className="text-xs text-slate-700">
                {ar ? 'القسم' : 'Department'}
              </label>
              {!useNewDept ? (
                <select
                  value={departmentId ?? ''}
                  onChange={(e) => setDepartmentId(e.target.value || null)}
                  disabled={save.isPending}
                  className={FIELD_CLS}
                >
                  <option value="">
                    {ar ? '— اختر قسمًا —' : '— Select a department —'}
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {ar ? d.nameAr || d.name : d.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2 mt-1">
                  <input
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    disabled={save.isPending}
                    placeholder={ar ? 'اسم القسم (إنجليزي)' : 'Department name (English)'}
                    className={FIELD_CLS}
                  />
                  <input
                    value={newDeptNameAr}
                    onChange={(e) => setNewDeptNameAr(e.target.value)}
                    disabled={save.isPending}
                    dir="rtl"
                    placeholder={ar ? 'اسم القسم (عربي)' : 'Department name (Arabic)'}
                    className={FIELD_CLS}
                  />
                </div>
              )}
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => {
                  setUseNewDept((v) => !v);
                  setDepartmentId(null);
                  setNewDeptName('');
                  setNewDeptNameAr('');
                }}
                className="mt-1 text-xs text-indigo-600 hover:underline"
              >
                {useNewDept
                  ? ar
                    ? 'اختيار قسم موجود'
                    : 'Pick an existing department'
                  : ar
                  ? '＋ قسم جديد'
                  : '＋ New department'}
              </button>
            </div>
          )}

          {/* PM department assignments (governance) */}
          {role === 'pm' && (
            <div>
              <label className="text-xs text-slate-700">{ar ? 'الإدارات المُسندة (مدير المشروع)' : 'Assigned departments (PM)'}</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {departments.map((d) => {
                  const on = pmDepartmentIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={save.isPending}
                      onClick={() => togglePmDept(d.id)}
                      className={
                        'rounded-full px-3 py-1 text-xs border transition-colors ' +
                        (on
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')
                      }
                    >
                      {ar ? d.nameAr || d.name : d.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Domains */}
          <div>
            <label className="text-xs text-slate-700">{ar ? 'المجالات' : 'Domains'}</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {domains.map((d) => {
                const on = domainIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={save.isPending}
                    onClick={() => toggleDomain(d.id)}
                    className={
                      'rounded-full px-3 py-1 text-xs border transition-colors ' +
                      (on
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')
                    }
                  >
                    {ar ? d.nameAr : d.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permissions */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-700">
                {ar ? 'الصلاحيات' : 'Permissions'}
              </label>
              {isSuperRole && (
                <span className="text-[11px] text-slate-400">
                  {ar ? 'مشرف عام — كل الصلاحيات' : 'Super Admin — all permissions'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              {ALL_PERMISSIONS.map((p) => {
                const on = isSuperRole || permissions.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={isSuperRole || save.isPending}
                    onClick={() => togglePermission(p)}
                    className={
                      'flex items-center justify-between rounded-md border px-3 py-2 text-sm text-start transition-colors ' +
                      (on
                        ? 'border-indigo-200 bg-indigo-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50') +
                      (isSuperRole ? ' opacity-70 cursor-not-allowed' : '')
                    }
                  >
                    <span className={on ? 'text-indigo-900' : 'text-slate-600'}>
                      {PERMISSION_LABELS[p][ar ? 'ar' : 'en']}
                    </span>
                    <span
                      className={
                        'ms-2 inline-flex h-4 w-4 items-center justify-center rounded ' +
                        (on ? 'bg-indigo-600 text-white' : 'border border-slate-300')
                      }
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active toggle (edit only) */}
          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={save.isPending}
              />
              {ar ? 'نشط' : 'Active'}
            </label>
          )}

          {save.isError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {(save.error as Error)?.message}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {ar ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!canSubmit || save.isPending}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit
              ? ar
                ? 'حفظ'
                : 'Save'
              : ar
              ? 'إنشاء العضو'
              : 'Create member'}
          </Button>
        </div>
      </div>
    </div>
  );
}