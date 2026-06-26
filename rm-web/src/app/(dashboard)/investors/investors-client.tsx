'use client';

// InvestorsPageClient — the main /investors UI.
//
// Owns:
//   - Search query string state
//   - Selected domain filter state
//   - Current modal state (add or edit, or closed)
//   - Loaded investors list (via React Query)
//
// Rendering:
//   - Header row: title + Add Investor + Export CSV
//   - Toolbar: search input + domain filter dropdown
//   - Table: investors grid with name (EN+AR), domain, country, contact, actions
//   - InvestorFormModal: rendered conditionally for add/edit
//
// Permissions:
//   - All authenticated users see the list, search, filter, export
//   - Only RM/ARM/Admin/super_admin see the Add button + can edit/delete
//   (Enforced server-side by RLS; client just hides the buttons to avoid 403s)

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Download,
  Search,
  Building2,
  Mail,
  Phone,
  Globe,
  Pencil,
  Trash2,
  Filter,
  X,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listInvestors, deleteInvestor } from '@/lib/investors/queries';
import { investorsToCsv, downloadCsv } from '@/lib/investors/csv';
import {
  DOMAIN_LABELS,
  INVESTOR_DOMAINS,
  type Investor,
  type InvestorDomain,
} from '@/types/investor';
import { InvestorFormModal } from '@/components/investors/investor-form-modal';
import { cn } from '@/lib/utils';
import { InvestorEmailModal } from '@/components/email/investor-email-modal';
import { getMyModulesControl } from '@/lib/modules/queries';

type ModalState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; investor: Investor };

export function InvestorsPageClient() {
  const { user } = useAuth();
  const { language, isRTL } = useLanguage();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState<InvestorDomain | ''>('');
  const [modal, setModal] = useState<ModalState>({ mode: 'closed' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [emailOpen, setEmailOpen] = useState(false);
  const modulesQ = useQuery({ queryKey: ['my-modules-control'], queryFn: getMyModulesControl });
  const canEmail = !!(modulesQ.data?.settings?.emails) && !!user?.permissions?.includes('send_investor_email');
  const orgId = modulesQ.data?.organizationId ?? '';
  const toggleSel = (id: string) => setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Can the current user create/edit/delete?
  const canMutate = useMemo(
    () => user && ['rm', 'arm', 'admin', 'super_admin'].includes(user.role),
    [user]
  );

  // Fetch investors. React Query caches and refetches on mutation invalidation.
  const { data: investors = [], isLoading, isError, error } = useQuery({
    queryKey: ['investors', { search, domain }],
    queryFn: () => listInvestors({
      search: search.trim() || undefined,
      domain: domain || undefined,
    }),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteInvestor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investors'] });
      setConfirmDeleteId(null);
    },
  });

  function handleExport() {
    const csv = investorsToCsv(investors, language);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `investors-${date}.csv`);
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {language === 'ar' ? 'المستثمرون' : 'Investors'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {investors.length} {language === 'ar' ? 'سجل' : 'records'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={investors.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {language === 'ar' ? 'تصدير CSV' : 'Export CSV'}
          </Button>
          {canMutate && (
            <Button
              size="sm"
              onClick={() => setModal({ mode: 'create' })}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              {language === 'ar' ? 'إضافة مستثمر' : 'Add Investor'}
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar: search + filter */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search
            className={cn(
              'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none',
              isRTL ? 'right-3' : 'left-3'
            )}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              language === 'ar'
                ? 'بحث (شركة، ممثل، دولة، بريد إلكتروني...)'
                : 'Search (company, rep, country, email...)'
            }
            className={isRTL ? 'pr-10' : 'pl-10'}
          />
        </div>
        <div className="relative">
          <Filter
            className={cn(
              'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none',
              isRTL ? 'right-3' : 'left-3'
            )}
          />
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value as InvestorDomain | '')}
            className={cn(
              'h-9 rounded-md border border-slate-200 bg-white text-sm w-full sm:w-56',
              'focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1',
              isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3'
            )}
          >
            <option value="">{language === 'ar' ? 'كل القطاعات' : 'All domains'}</option>
            {INVESTOR_DOMAINS.map((d) => (
              <option key={d} value={d}>
                {language === 'ar' ? DOMAIN_LABELS[d].ar : DOMAIN_LABELS[d].en}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-500">
          {language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}
        </div>
      )}

      {isError && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-6 text-sm text-red-800">
          {language === 'ar' ? 'حدث خطأ' : 'Error'}: {(error as Error)?.message}
        </div>
      )}

      {!isLoading && !isError && investors.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">
            {language === 'ar' ? 'لا توجد سجلات' : 'No investors yet'}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {search || domain
              ? language === 'ar' ? 'لم يتم العثور على نتائج للبحث' : 'No results match your filters'
              : language === 'ar' ? 'انقر "إضافة مستثمر" للبدء' : 'Click "Add Investor" to get started'}
          </p>
        </div>
      )}

      {!isLoading && !isError && investors.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            {canEmail && selectedIds.size > 0 && (
              <div className="flex items-center justify-between gap-2 px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                <span className="text-sm text-indigo-800">
                  {language === 'ar' ? `${selectedIds.size} محدد` : `${selectedIds.size} selected`}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 hover:text-slate-700">
                    {language === 'ar' ? 'مسح' : 'Clear'}
                  </button>
                  <Button onClick={() => setEmailOpen(true)} className="gap-2 h-8 bg-indigo-600 hover:bg-indigo-700">
                    <Mail className="h-4 w-4" />{language === 'ar' ? 'إرسال بريد' : 'Email'}
                  </Button>
                </div>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className={cn('text-slate-600', isRTL ? 'text-right' : 'text-left')}>
                  {canEmail && (
                    <th className="px-4 py-3 font-medium w-1">
                      <input
                        type="checkbox"
                        checked={investors.length > 0 && selectedIds.size === investors.length}
                        onChange={(e) => setSelectedIds(e.target.checked ? new Set(investors.map((i) => i.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium">{language === 'ar' ? 'الشركة' : 'Company'}</th>
                  <th className="px-4 py-3 font-medium">{language === 'ar' ? 'القطاع' : 'Domain'}</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">{language === 'ar' ? 'الدولة' : 'Country'}</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">{language === 'ar' ? 'الممثل' : 'Representative'}</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">{language === 'ar' ? 'الاتصال' : 'Contact'}</th>
                  {canMutate && <th className="px-4 py-3 font-medium w-1"></th>}
                </tr>
              </thead>
              <tbody>
                {investors.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    {canEmail && (
                      <td className="px-4 py-3 align-top">
                        <input type="checkbox" checked={selectedIds.has(inv.id)} onChange={() => toggleSel(inv.id)} />
                      </td>
                    )}
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-slate-900">
                        {language === 'ar' ? inv.companyNameAr || inv.companyName : inv.companyName}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5" dir={language === 'ar' ? 'ltr' : 'auto'}>
                        {language === 'ar' ? inv.companyName : inv.companyNameAr}
                      </div>
                      {inv.sourceSystem === 'mobile_scan' && (
                        <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                          {language === 'ar' ? 'مسح بطاقة' : 'Mobile Scan'}
                        </span>
                      )}
                      {inv.website && (
                        <a
                          href={inv.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 mt-1"
                          dir="ltr"
                        >
                          <Globe className="h-3 w-3" /> {hostnameOf(inv.website)}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
                        {language === 'ar' ? DOMAIN_LABELS[inv.domainType].ar : DOMAIN_LABELS[inv.domainType].en}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top hidden md:table-cell">
                      <div className="text-slate-700">{inv.country}</div>
                      <div className="text-xs text-slate-500">{inv.city}</div>
                    </td>
                    <td className="px-4 py-3 align-top hidden lg:table-cell">
                      <div className="text-slate-700">
                        {language === 'ar' ? inv.representativeNameAr || inv.representativeName : inv.representativeName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {language === 'ar' ? inv.positionAr || inv.position : inv.position}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top hidden lg:table-cell">
                      <a
                        href={`mailto:${inv.email}`}
                        className="flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900"
                        dir="ltr"
                      >
                        <Mail className="h-3 w-3" /> {inv.email}
                      </a>
                      <a
                        href={`tel:${inv.mobileCountryCode}${inv.mobileNumber}`}
                        className="flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 mt-0.5"
                        dir="ltr"
                      >
                        <Phone className="h-3 w-3" /> {inv.mobileCountryCode} {inv.mobileNumber}
                      </a>
                    </td>
                    {canMutate && (
                      <td className="px-2 py-3 align-top whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setModal({ mode: 'edit', investor: inv })}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                            aria-label={language === 'ar' ? 'تعديل' : 'Edit'}
                            title={language === 'ar' ? 'تعديل' : 'Edit'}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(inv.id)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                            aria-label={language === 'ar' ? 'حذف' : 'Delete'}
                            title={language === 'ar' ? 'حذف' : 'Delete'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {emailOpen && (
        <InvestorEmailModal
          recipients={investors.filter((i) => selectedIds.has(i.id)).map((i) => ({ id: i.id, name: i.representativeName || i.companyName, email: i.email ?? null }))}
          organizationId={orgId}
          onClose={() => { setEmailOpen(false); }}
        />
      )}
      {modal.mode !== 'closed' && (
        <InvestorFormModal
          mode={modal.mode}
          investor={modal.mode === 'edit' ? modal.investor : undefined}
          onClose={() => setModal({ mode: 'closed' })}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['investors'] });
            setModal({ mode: 'closed' });
          }}
        />
      )}

      {/* Delete confirm */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-5">
            <h3 className="text-lg font-semibold text-slate-900">
              {language === 'ar' ? 'تأكيد الحذف' : 'Confirm delete'}
            </h3>
            <p className="text-sm text-slate-600 mt-2">
              {language === 'ar'
                ? 'هل أنت متأكد من حذف هذا المستثمر؟ يمكن استعادته لاحقًا بواسطة المسؤول.'
                : 'Delete this investor? This is a soft delete — a super admin can restore later.'}
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)} disabled={deleteMutation.isPending}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                size="sm"
                onClick={() => deleteMutation.mutate(confirmDeleteId)}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteMutation.isPending
                  ? language === 'ar' ? 'جارٍ الحذف...' : 'Deleting...'
                  : language === 'ar' ? 'حذف' : 'Delete'}
              </Button>
            </div>
            {deleteMutation.isError && (
              <p className="text-xs text-red-600 mt-2">
                {(deleteMutation.error as Error)?.message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
