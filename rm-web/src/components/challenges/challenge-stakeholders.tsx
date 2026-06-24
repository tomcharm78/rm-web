'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Trash2, Loader2, X, Mail, Phone, Search, KeyRound, Copy, Check, ShieldOff, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { CollapsibleCard } from '@/components/challenges/collapsible-card';
import { listContacts, createContact } from '@/lib/contacts/queries';
import type { Contact, ContactType } from '@/types/contact';
import {
  listChallengeStakeholders, linkContactToChallenge, deleteChallengeStakeholder,
} from '@/lib/challenges/stakeholders';
import {
  listChallengeAccess, revokeAccess, generateStakeholderAccess, type ChallengeAccess,
} from '@/lib/challenges/stakeholder-access';

const IN = 'w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const LBL = 'text-xs text-slate-500 mb-1 block';

function typeLabel(t: string, ar: boolean) {
  const m: Record<string, [string, string]> = {
    internal_moh: ['MOH Internal', 'داخلي - الوزارة'], external: ['External', 'خارجي'],
    government: ['Government', 'حكومي'], private: ['Private', 'قطاع خاص'], other: ['Other', 'أخرى'],
  };
  return m[t] ? (ar ? m[t][1] : m[t][0]) : t;
}
function typeColor(t: string) {
  switch (t) {
    case 'internal_moh': return 'bg-indigo-100 text-indigo-700';
    case 'government': return 'bg-blue-100 text-blue-700';
    case 'private': return 'bg-purple-100 text-purple-700';
    case 'other': return 'bg-slate-100 text-slate-600';
    default: return 'bg-emerald-100 text-emerald-700';
  }
}

function CopyBtn({ value, ar }: { value: string; ar: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
    >
      {done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{done ? (ar ? 'تم النسخ' : 'Copied') : (ar ? 'نسخ' : 'Copy')}
    </button>
  );
}

function grantErrorMessage(code: string, ar: boolean): string {
  const m: Record<string, [string, string]> = {
    contact_email_required: ['An email is required to grant access.', 'يلزم بريد إلكتروني لمنح الوصول.'],
    email_belongs_to_staff: ['That email belongs to a staff account — cannot grant stakeholder access.', 'هذا البريد لحساب داخلي — لا يمكن منح وصول طرف خارجي.'],
  };
  return m[code] ? (ar ? m[code][1] : m[code][0]) : (ar ? 'تعذّر منح الوصول.' : 'Could not grant access.');
}

export function ChallengeStakeholders({ challengeId }: { challengeId: string }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [creds, setCreds] = useState<null | { loginUrl: string; username: string; tempPassword: string | null; isNewAccount: boolean }>(null);

  const isManager = (user?.role === 'admin' || user?.role === 'super_admin');

  const listQ = useQuery({
    queryKey: ['challenge-stakeholders', challengeId],
    queryFn: () => listChallengeStakeholders(challengeId),
  });
  const accessQ = useQuery({
    queryKey: ['challenge-access', challengeId],
    queryFn: () => listChallengeAccess(challengeId),
    enabled: isManager,
  });
  const stakeholders = listQ.data ?? [];
  const access = accessQ.data ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['challenge-stakeholders', challengeId] });
    qc.invalidateQueries({ queryKey: ['challenge-access', challengeId] });
  };

  const removeMut = useMutation({ mutationFn: (id: string) => deleteChallengeStakeholder(id), onSuccess: refresh });
  const revokeMut = useMutation({ mutationFn: (id: string) => revokeAccess(id), onSuccess: refresh });
  const grantMut = useMutation({
    mutationFn: (contactId: string) => generateStakeholderAccess(challengeId, contactId),
    onSuccess: (res) => { setCreds(res); refresh(); },
  });

  if (!user) return null;

  const activeAccessFor = (email: string | null): ChallengeAccess | undefined => {
    if (!email) return undefined;
    return access.find((a) => a.stakeholderEmail && a.stakeholderEmail.toLowerCase() === email.toLowerCase() && a.status === 'active');
  };

  const grantError = grantMut.isError ? (grantMut.error as Error).message : '';
  return (
    <CollapsibleCard
      title={ar ? 'الأطراف المعنية' : 'Stakeholders'}
      icon={<Users className="h-4 w-4 text-slate-500" />}
      count={stakeholders.length}
      headerActions={isManager ? (
        <Button onClick={() => setModalOpen(true)} variant="outline" className="gap-1 h-8 px-2 text-xs">
          <Plus className="h-3 w-3" />{ar ? 'ربط جهة اتصال' : 'Link contact'}
        </Button>
      ) : undefined}
    >
      {listQ.isLoading && <p className="text-sm text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {!listQ.isLoading && stakeholders.length === 0 && (
        <p className="text-sm text-slate-400">{ar ? 'لم تُربط أطراف بعد.' : 'No stakeholders linked yet.'}</p>
      )}

      {creds && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-emerald-800">{ar ? 'بيانات الدخول' : 'Access credentials'}</span>
            <button onClick={() => setCreds(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          {creds.isNewAccount ? (
            <div className="space-y-1 text-slate-700">
              <div className="flex items-center justify-between gap-2"><span>{ar ? 'الرابط:' : 'Login link:'} <span className="font-mono text-xs">{creds.loginUrl}</span></span><CopyBtn value={creds.loginUrl} ar={ar} /></div>
              <div className="flex items-center justify-between gap-2"><span>{ar ? 'المستخدم:' : 'Username:'} <span className="font-mono text-xs">{creds.username}</span></span><CopyBtn value={creds.username} ar={ar} /></div>
              <div className="flex items-center justify-between gap-2"><span>{ar ? 'كلمة المرور المؤقتة:' : 'Temp password:'} <span className="font-mono text-xs">{creds.tempPassword}</span></span><CopyBtn value={creds.tempPassword ?? ''} ar={ar} /></div>
              <p className="text-xs text-emerald-700 mt-1">{ar ? 'انسخ هذه البيانات الآن وأرسلها للطرف المعني — لن تظهر كلمة المرور مرة أخرى.' : 'Copy and send these now — the password won’t be shown again.'}</p>
            </div>
          ) : (
            <div className="space-y-1 text-slate-700">
              <div className="flex items-center justify-between gap-2"><span>{ar ? 'الرابط:' : 'Login link:'} <span className="font-mono text-xs">{creds.loginUrl}</span></span><CopyBtn value={creds.loginUrl} ar={ar} /></div>
              <p className="text-xs text-emerald-700 mt-1">{ar ? 'لهذا الشخص حساب بالفعل — أرسل له الرابط ليدخل ببياناته الحالية.' : 'This person already has an account — send the link; they sign in with their existing credentials.'}</p>
            </div>
          )}
        </div>
      )}
      {grantError && <p className="text-xs text-red-600 mb-2">{grantErrorMessage(grantError, ar)}</p>}

      <ul className="space-y-2">
        {stakeholders.map((s) => {
          const acc = activeAccessFor(s.email);
          return (
            <li key={s.id} className="rounded-md border border-slate-100 bg-slate-50/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800">{ar ? s.nameAr || s.name : s.name}</span>
                    <span className={'rounded px-1.5 py-0.5 text-xs ' + typeColor(s.type)}>{typeLabel(s.type, ar)}</span>
                    {acc && (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-teal-100 text-teal-700">
                        <Clock className="h-3 w-3" />{ar ? `وصول فعّال · ${acc.daysLeft} يوم` : `Access · ${acc.daysLeft}d left`}
                      </span>
                    )}
                  </div>
                  {(s.linkRole || s.organization) && (
                    <p className="text-xs text-slate-500 mt-0.5">{[s.linkRole, s.organization].filter(Boolean).join(ar ? ' — ' : ' · ')}</p>
                  )}
                  {s.email && <a href={'mailto:' + s.email} className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1 mt-0.5"><Mail className="h-3 w-3" />{s.email}</a>}
                  {s.phone && <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</p>}
                </div>

                {isManager && (
                  <div className="flex items-center gap-1 shrink-0">
                    {acc ? (
                      <button
                        onClick={() => { if (confirm(ar ? 'إلغاء وصول هذا الطرف؟' : 'Revoke this stakeholder’s access?')) revokeMut.mutate(acc.id); }}
                        className="text-slate-400 hover:text-amber-600 p-1" title={ar ? 'إلغاء الوصول' : 'Revoke access'}
                      >
                        <ShieldOff className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => { if (!s.contactId) return; grantMut.mutate(s.contactId); }}
                        disabled={!s.contactId || (grantMut.isPending && grantMut.variables === s.contactId)}
                        className="text-slate-400 hover:text-indigo-600 p-1 disabled:opacity-50" title={ar ? 'منح وصول' : 'Grant access'}
                      >
                        {grantMut.isPending && grantMut.variables === s.contactId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button
                      onClick={() => { if (confirm(ar ? 'إلغاء ربط هذا الطرف؟ (يبقى في الدليل)' : 'Detach this stakeholder? (stays in the directory)')) removeMut.mutate(s.id); }}
                      className="text-slate-400 hover:text-red-600 p-1" title={ar ? 'إلغاء الربط' : 'Detach'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {isManager && !acc && !s.email && (
                <p className="text-[11px] text-amber-600 mt-1">{ar ? 'يلزم بريد إلكتروني لمنح الوصول — عدّل جهة الاتصال في الدليل.' : 'An email is required to grant access — edit the contact in the directory.'}</p>
              )}
            </li>
          );
        })}
      </ul>

      {modalOpen && (
        <LinkStakeholderModal
          challengeId={challengeId}
          ar={ar}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); refresh(); }}
        />
      )}
    </CollapsibleCard>
  );
}

function LinkStakeholderModal({ challengeId, ar, onClose, onSaved }: {
  challengeId: string; ar: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [linkRole, setLinkRole] = useState('');

  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [org, setOrg] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<ContactType>('external');

  const contactsQ = useQuery({ queryKey: ['contacts-list'], queryFn: listContacts });
  const contacts = contactsQ.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts.slice(0, 30);
    return contacts.filter((c) =>
      [c.name, c.nameAr, c.email, c.organization, c.role].filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    ).slice(0, 30);
  }, [contacts, search]);

  const saveMut = useMutation({
    mutationFn: async () => {
      let contactId = selectedId;
      if (tab === 'new') {
        const created: Contact = await createContact({ name, nameAr, email, organization: org, role, phone, type });
        contactId = created.id;
      }
      if (!contactId) throw new Error(ar ? 'اختر جهة اتصال' : 'Select a contact');
      await linkContactToChallenge({ challengeId, contactId, linkRole });
    },
    onSuccess: onSaved,
  });

  const TYPE_FORM: ContactType[] = ['internal_moh', 'external', 'government', 'private', 'other'];
  const canSave = tab === 'existing' ? !!selectedId : !!name.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg my-8" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="font-semibold">{ar ? 'ربط طرف معني' : 'Link a stakeholder'}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex gap-1 px-4 pt-3">
          <button onClick={() => setTab('existing')} className={'px-3 py-1.5 text-sm rounded-md ' + (tab === 'existing' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
            {ar ? 'من الدليل' : 'From directory'}
          </button>
          <button onClick={() => setTab('new')} className={'px-3 py-1.5 text-sm rounded-md ' + (tab === 'new' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
            {ar ? 'جهة جديدة' : 'New contact'}
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {tab === 'existing' ? (
            <>
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute top-2.5 start-3" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={ar ? 'بحث في الدليل…' : 'Search directory…'} className={IN + ' ps-9'} />
              </div>
              <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-md divide-y divide-slate-100">
                {contactsQ.isLoading && <p className="p-3 text-sm text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
                {!contactsQ.isLoading && filtered.length === 0 && <p className="p-3 text-sm text-slate-400">{ar ? 'لا نتائج' : 'No results'}</p>}
                {filtered.map((c) => (
                  <button key={c.id} onClick={() => setSelectedId(c.id)} className={'w-full text-start px-3 py-2 text-sm hover:bg-slate-50 ' + (selectedId === c.id ? 'bg-indigo-50' : '')}>
                    <span className="font-medium text-slate-800">{ar ? c.nameAr || c.name : c.name}</span>
                    {(c.role || c.organization) && <span className="text-slate-500"> — {[c.role, c.organization].filter(Boolean).join(' · ')}</span>}
                    {c.email && <span className="block text-xs text-slate-400">{c.email}</span>}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LBL}>{ar ? 'الاسم (EN)' : 'Name (EN)'} *</label><input value={name} onChange={(e) => setName(e.target.value)} className={IN} /></div>
                <div><label className={LBL}>{ar ? 'الاسم (AR)' : 'Name (AR)'}</label><input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" className={IN} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LBL}>{ar ? 'الجهة' : 'Organization'}</label><input value={org} onChange={(e) => setOrg(e.target.value)} className={IN} /></div>
                <div><label className={LBL}>{ar ? 'الدور / المنصب' : 'Role / title'}</label><input value={role} onChange={(e) => setRole(e.target.value)} className={IN} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LBL}>{ar ? 'البريد' : 'Email'}</label><input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className={IN} /></div>
                <div><label className={LBL}>{ar ? 'الهاتف' : 'Phone'}</label><input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className={IN} /></div>
              </div>
              <div><label className={LBL}>{ar ? 'النوع' : 'Type'}</label>
                <select value={type} onChange={(e) => setType(e.target.value as ContactType)} className={IN}>
                  {TYPE_FORM.map((t) => <option key={t} value={t}>{typeLabel(t, ar)}</option>)}
                </select>
              </div>
            </>
          )}

          <div className="pt-2 border-t border-slate-100">
            <label className={LBL}>{ar ? 'الدور في هذا التحدي (اختياري)' : 'Role on this challenge (optional)'}</label>
            <input value={linkRole} onChange={(e) => setLinkRole(e.target.value)} placeholder={ar ? 'مثال: مستشار قانوني' : 'e.g. Legal advisor'} className={IN} />
          </div>

          {saveMut.isError && <p className="text-xs text-red-600">{(saveMut.error as Error)?.message}</p>}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
          <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>{ar ? 'إلغاء' : 'Cancel'}</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!canSave || saveMut.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{ar ? 'ربط' : 'Link'}
          </Button>
        </div>
      </div>
    </div>
  );
}