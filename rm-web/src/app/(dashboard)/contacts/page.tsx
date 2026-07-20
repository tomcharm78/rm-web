'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Download } from 'lucide-react';
import { ContactImportModal } from '@/components/contacts/import/contact-import-modal';
import { exportDirectoryToExcel } from '@/lib/contacts/export';
import { findDuplicateIds } from '@/lib/contacts/import/import-queries';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Contact as ContactIcon, Plus, Loader2, X, Pencil, Trash2, Mail, Phone, Building2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { listDirectory, createContact, updateContact, softDeleteContact } from '@/lib/contacts/queries';
import type { Contact, ContactType, DirectoryEntry } from '@/types/contact';

const FILTER_CLS = 'h-9 rounded-md border border-slate-200 bg-white px-3 text-sm';
const IN = 'w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const LBL = 'text-xs text-slate-600';

const TYPE_OPTS: (ContactType | 'investor')[] = ['internal_moh', 'external', 'government', 'private', 'other', 'investor'];
function typeLabel(t: string, ar: boolean) {
  const m: Record<string, [string, string]> = {
    internal_moh: ['MOH Internal', 'داخلي - الوزارة'], external: ['External', 'خارجي'],
    government: ['Government', 'حكومي'], private: ['Private', 'قطاع خاص'],
    other: ['Other', 'أخرى'], investor: ['Investor Rep', 'ممثل مستثمر'],
  };
  return m[t] ? (ar ? m[t][1] : m[t][0]) : t;
}
function typeColor(t: string) {
  switch (t) {
    case 'internal_moh': return 'bg-indigo-100 text-indigo-700';
    case 'government': return 'bg-blue-100 text-blue-700';
    case 'private': return 'bg-purple-100 text-purple-700';
    case 'investor': return 'bg-teal-100 text-teal-700';
    case 'other': return 'bg-slate-100 text-slate-600';
    default: return 'bg-emerald-100 text-emerald-700';
  }
}

export default function ContactsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const router = useRouter();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [fType, setFType] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const dirQ = useQuery({ queryKey: ['contacts-directory'], queryFn: listDirectory });
  const entries = dirQ.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['contacts-directory'] });

  const removeMut = useMutation({
    mutationFn: (id: string) => softDeleteContact(id),
    onSuccess: refresh,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (fType && e.type !== fType) return false;
      if (!q) return true;
      return [e.name, e.nameAr, e.email, e.organization, e.role, e.phone]
        .filter(Boolean).some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [entries, search, fType]);

  // Duplicates are computed from the data on screen rather than stored as a
  // flag, so the badge stays truthful and self-heals when one of a pair is
  // deleted. Key is email + phone, BOTH required — a shared office number or a
  // generic inbox is not enough on its own to call two people the same person.
  const duplicateIds = useMemo(() => findDuplicateIds(entries), [entries]);

  if (!user) return null;

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ContactIcon className="h-5 w-5 text-indigo-600" />
          <h1 className="text-xl font-semibold">{ar ? 'دليل جهات الاتصال' : 'Contacts Directory'}</h1>
          <span className="text-sm text-slate-400">({filtered.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => exportDirectoryToExcel(filtered, ar)}
            disabled={filtered.length === 0}
            className="gap-2"
            title={ar ? 'يصدّر ما هو معروض حاليًا' : 'Exports what is currently shown'}
          >
            <Download className="h-4 w-4" />{ar ? 'تصدير Excel' : 'Export Excel'}
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />{ar ? 'استيراد' : 'Import'}
          </Button>
          <Button onClick={() => setAddOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4" />{ar ? 'إضافة جهة اتصال' : 'Add contact'}
          </Button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-5">{ar ? 'دليل موحّد للأشخاص — جهات داخلية وخارجية وممثلو المستثمرين.' : 'A unified directory of people — internal, external, and investor representatives.'}</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={ar ? 'بحث بالاسم أو الجهة أو البريد…' : 'Search name, organization, email…'}
          className={FILTER_CLS + ' flex-1 min-w-[200px]'}
        />
        <select value={fType} onChange={(e) => setFType(e.target.value)} className={FILTER_CLS}>
          <option value="">{ar ? 'كل الأنواع' : 'All types'}</option>
          {TYPE_OPTS.map((t) => <option key={t} value={t}>{typeLabel(t, ar)}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3">{ar ? 'الاسم' : 'Name'}</th>
              <th className="px-4 py-3">{ar ? 'النوع' : 'Type'}</th>
              <th className="px-4 py-3">{ar ? 'الجهة / الدور' : 'Organization / Role'}</th>
              <th className="px-4 py-3">{ar ? 'التواصل' : 'Contact'}</th>
              <th className="px-4 py-3 text-right">{ar ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {dirQ.isLoading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</td></tr>
            )}
            {!dirQ.isLoading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{ar ? 'لا توجد جهات اتصال' : 'No contacts'}</td></tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {ar ? e.nameAr || e.name : e.name || (ar ? '(بدون اسم)' : '(no name)')}
                  {duplicateIds.has(e.id) && (
                    <span
                      className="ms-2 rounded px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 align-middle"
                      title={ar ? 'نفس البريد والهاتف لجهة أخرى' : 'Same email and phone as another entry'}
                    >
                      {ar ? 'مكرر' : 'Duplicate'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3"><span className={'rounded px-2 py-0.5 text-xs ' + typeColor(e.type)}>{typeLabel(e.type, ar)}</span></td>
                <td className="px-4 py-3 text-slate-600">
                  {(e.role || e.organization)
                    ? [e.role, e.organization].filter(Boolean).join(ar ? ' — ' : ' · ')
                    : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div className="flex flex-col gap-0.5">
                    {e.email && <a href={'mailto:' + e.email} className="text-indigo-600 hover:underline inline-flex items-center gap-1"><Mail className="h-3 w-3" />{e.email}</a>}
                    {e.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{e.phone}</span>}
                    {!e.email && !e.phone && '—'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {e.editable && e.contact ? (
                      <>
                        <button onClick={() => setEditing(e.contact!)} className="text-slate-400 hover:text-indigo-600 p-1" title={ar ? 'تعديل' : 'Edit'}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { if (confirm(ar ? 'حذف جهة الاتصال؟' : 'Remove this contact?')) removeMut.mutate(e.contact!.id); }}
                          className="text-slate-400 hover:text-red-600 p-1" title={ar ? 'حذف' : 'Remove'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => router.push('/investors')} className="text-slate-400 hover:text-indigo-600 p-1" title={ar ? 'عرض في المستثمرين' : 'Open in Investors'}>
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <ContactModal ar={ar} editing={null} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); refresh(); }} />
      )}
      {importOpen && (
        <ContactImportModal
          onClose={() => setImportOpen(false)}
          onImported={refresh}
        />
      )}
      {editing && (
        <ContactModal ar={ar} editing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      )}
    </div>
  );
}

function ContactModal({ ar, editing, onClose, onSaved }: {
  ar: boolean;
  editing: Contact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const [name, setName] = useState(editing?.name ?? '');
  const [nameAr, setNameAr] = useState(editing?.nameAr ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [org, setOrg] = useState(editing?.organization ?? '');
  const [role, setRole] = useState(editing?.role ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [type, setType] = useState<ContactType>(editing?.type ?? 'external');

  const saveMut = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return updateContact(editing!.id, { name, nameAr, email, organization: org, role, phone, type });
      }
      return createContact({ name, nameAr, email, organization: org, role, phone, type });
    },
    onSuccess: onSaved,
  });

  const TYPE_FORM: ContactType[] = ['internal_moh', 'external', 'government', 'private', 'other'];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg my-8" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="font-semibold">{isEdit ? (ar ? 'تعديل جهة اتصال' : 'Edit contact') : (ar ? 'إضافة جهة اتصال' : 'Add contact')}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LBL}>{ar ? 'الاسم (EN)' : 'Name (EN)'} *</label><input value={name} onChange={(e) => setName(e.target.value)} className={IN} /></div>
            <div><label className={LBL}>{ar ? 'الاسم (AR)' : 'Name (AR)'}</label><input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" className={IN} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LBL}>{ar ? 'الجهة' : 'Organization'}</label><input value={org} onChange={(e) => setOrg(e.target.value)} className={IN} /></div>
            <div><label className={LBL}>{ar ? 'الدور / المنصب' : 'Role / title'}</label><input value={role} onChange={(e) => setRole(e.target.value)} className={IN} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LBL}>{ar ? 'البريد الإلكتروني' : 'Email'}</label><input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className={IN} /></div>
            <div><label className={LBL}>{ar ? 'الهاتف' : 'Phone'}</label><input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className={IN} /></div>
          </div>
          <div>
            <label className={LBL}>{ar ? 'النوع' : 'Type'}</label>
            <select value={type} onChange={(e) => setType(e.target.value as ContactType)} className={IN}>
              {TYPE_FORM.map((t) => <option key={t} value={t}>{typeLabel(t, ar)}</option>)}
            </select>
          </div>
          {saveMut.isError && <p className="text-xs text-red-600">{(saveMut.error as Error)?.message}</p>}
          <p className="text-xs text-slate-400">{ar ? 'البريد اختياري، لكنه يجب أن يكون فريدًا إن وُجد.' : 'Email is optional, but must be unique when provided.'}</p>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
          <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>{ar ? 'إلغاء' : 'Cancel'}</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!name.trim() || saveMut.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{isEdit ? (ar ? 'حفظ' : 'Save') : (ar ? 'إضافة' : 'Add')}
          </Button>
        </div>
      </div>
    </div>
  );
}
