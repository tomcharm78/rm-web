'use client';

// Members roster + add/edit. Lifecycle (activate/deactivate/delete) inline;
// create/edit via MemberFormModal. RLS-scoped; you can't deactivate/delete self.

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users as UsersIcon,
  Search,
  UserCheck,
  UserX,
  Trash2,
  Loader2,
  ShieldAlert,
  Plus,
  Pencil,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  listMembers,
  listDomains,
  deactivateMember,
  reactivateMember,
  softDeleteMember,
  type Member,
} from '@/lib/users/queries';
import { ROLE_LABELS } from '@/lib/users/constants';
import { MemberFormModal } from '@/components/users/member-form-modal';
import type { UserRole } from '@/types';

export function UsersClient() {
  const { user, isInitialized } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // null = closed, 'new' = create, Member = edit that member
  const [modalState, setModalState] = useState<'new' | Member | null>(null);

  const membersQ = useQuery({ queryKey: ['members'], queryFn: listMembers });
  const domainsQ = useQuery({ queryKey: ['domains'], queryFn: listDomains });
  const members = membersQ.data ?? [];
  const domains = domainsQ.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['members'] });
  const deact = useMutation({ mutationFn: deactivateMember, onSuccess: invalidate });
  const react = useMutation({ mutationFn: reactivateMember, onSuccess: invalidate });
  const del = useMutation({ mutationFn: softDeleteMember, onSuccess: invalidate });

  const memberById = useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => m.set(x.id, x));
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (statusFilter === 'active' && !m.isActive) return false;
      if (statusFilter === 'inactive' && m.isActive) return false;
      if (q) {
        const hit =
          m.name.toLowerCase().includes(q) ||
          m.nameAr.includes(search.trim()) ||
          m.email.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [members, roleFilter, statusFilter, search]);

  if (!isInitialized) {
    return <div className="p-8 text-slate-500">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>;
  }
  if (!user) return null;

  const canManage =
    user.role === 'super_admin' ||
    user.role === 'admin' ||
    user.permissions.includes('manage_users');
  const isSuper = user.role === 'super_admin';

  if (!canManage) {
    return (
      <div className="p-6 lg:p-8">
        <div className="bg-white rounded-lg border border-slate-200 p-8 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold">{ar ? 'لا تملك صلاحية الوصول' : 'No access'}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {ar
                ? 'إدارة المستخدمين متاحة للمشرفين فقط.'
                : 'User management is available to admins only.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const roleLabel = (r: UserRole) => ROLE_LABELS[r]?.[ar ? 'ar' : 'en'] ?? r;
  const domainLabel = (id: string) => {
    const d = domains.find((x) => x.id === id);
    return d ? (ar ? d.nameAr : d.name) : id.slice(0, 6);
  };
  const personName = (m: Member) => (ar ? m.nameAr || m.name : m.name);

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <div className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-indigo-600" />
            <h1 className="text-xl font-semibold">{ar ? 'المستخدمون' : 'Members'}</h1>
            <span className="text-sm text-slate-400">({filtered.length})</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {ar
              ? 'إدارة أعضاء الفريق وأدوارهم وصلاحياتهم.'
              : 'Manage team members, their roles, permissions and status.'}
          </p>
        </div>
        <Button
          onClick={() => setModalState('new')}
          className="gap-2 bg-indigo-600 hover:bg-indigo-700 flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{ar ? 'إضافة عضو' : 'Add member'}</span>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 my-4">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-slate-400" />
          <Input
            className="ps-9"
            placeholder={ar ? 'بحث بالاسم أو البريد…' : 'Search name or email…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
        >
          <option value="all">{ar ? 'كل الأدوار' : 'All roles'}</option>
          {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
        >
          <option value="all">{ar ? 'كل الحالات' : 'All statuses'}</option>
          <option value="active">{ar ? 'نشط' : 'Active'}</option>
          <option value="inactive">{ar ? 'غير نشط' : 'Inactive'}</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {membersQ.isLoading ? (
          <div className="p-8 text-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin inline" />
          </div>
        ) : membersQ.isError ? (
          <div className="p-6 text-sm text-red-700 bg-red-50">
            {(membersQ.error as Error)?.message}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            {ar ? 'لا يوجد أعضاء مطابقون.' : 'No matching members.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs">
                  <th className="text-start font-medium px-4 py-2.5">{ar ? 'العضو' : 'Member'}</th>
                  <th className="text-start font-medium px-4 py-2.5">{ar ? 'الدور' : 'Role'}</th>
                  <th className="text-start font-medium px-4 py-2.5">{ar ? 'المجالات' : 'Domains'}</th>
                  <th className="text-start font-medium px-4 py-2.5">{ar ? 'يتبع لـ' : 'Reports to'}</th>
                  <th className="text-start font-medium px-4 py-2.5">{ar ? 'الحالة' : 'Status'}</th>
                  <th className="text-end font-medium px-4 py-2.5">{ar ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((m) => {
                  const isSelf = m.id === user.id;
                  const busy =
                    (deact.isPending && deact.variables === m.id) ||
                    (react.isPending && react.variables === m.id) ||
                    (del.isPending && del.variables === m.id);
                  const reportsTo = m.adminId ? memberById.get(m.adminId) : null;

                  const confirmDeact = () => {
                    const msg = ar ? `تعطيل ${personName(m)}؟` : `Deactivate ${personName(m)}?`;
                    if (window.confirm(msg)) deact.mutate(m.id);
                  };
                  const confirmDel = () => {
                    const msg = ar
                      ? `حذف ${personName(m)}؟ يمكن استعادته لاحقًا.`
                      : `Delete ${personName(m)}? This can be restored later.`;
                    if (window.confirm(msg)) del.mutate(m.id);
                  };

                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                            {personName(m).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{personName(m)}</div>
                            <div className="text-xs text-slate-500 truncate">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {roleLabel(m.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {m.domainIds.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {m.domainIds.slice(0, 2).map((id) => (
                              <span
                                key={id}
                                className="inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700"
                              >
                                {domainLabel(id)}
                              </span>
                            ))}
                            {m.domainIds.length > 2 && (
                              <span className="text-xs text-slate-400">+{m.domainIds.length - 2}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {reportsTo ? personName(reportsTo) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {m.isActive ? (
                          <span className="inline-block rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                            {ar ? 'نشط' : 'Active'}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            {ar ? 'غير نشط' : 'Inactive'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}

                          <button
                            type="button"
                            disabled={busy}
                            title={ar ? 'تعديل' : 'Edit'}
                            onClick={() => setModalState(m)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>

                          {m.isActive ? (
                            <button
                              type="button"
                              disabled={isSelf || busy}
                              title={
                                isSelf
                                  ? ar
                                    ? 'لا يمكنك تعطيل حسابك'
                                    : "Can't deactivate yourself"
                                  : ar
                                  ? 'تعطيل'
                                  : 'Deactivate'
                              }
                              onClick={confirmDeact}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <UserX className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              title={ar ? 'تفعيل' : 'Reactivate'}
                              onClick={() => react.mutate(m.id)}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-green-600 hover:bg-green-50 disabled:opacity-30"
                            >
                              <UserCheck className="h-4 w-4" />
                            </button>
                          )}

                          {isSuper && (
                            <button
                              type="button"
                              disabled={isSelf || busy}
                              title={
                                isSelf
                                  ? ar
                                    ? 'لا يمكنك حذف حسابك'
                                    : "Can't delete yourself"
                                  : ar
                                  ? 'حذف'
                                  : 'Delete'
                              }
                              onClick={confirmDel}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
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

      {modalState !== null && (
        <MemberFormModal
          member={modalState === 'new' ? null : modalState}
          onClose={() => setModalState(null)}
          onSaved={() => setModalState(null)}
        />
      )}
    </div>
  );
}