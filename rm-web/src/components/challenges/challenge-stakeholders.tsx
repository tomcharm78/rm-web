'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Pencil, Trash2, Loader2, X, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import {
  listChallengeStakeholders, createChallengeStakeholder,
  updateChallengeStakeholder, deleteChallengeStakeholder,
  type ChallengeStakeholder, type StakeholderType,
} from '@/lib/challenges/stakeholders';

const IN = 'w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const LBL = 'text-xs text-slate-500 mb-1 block';

const TYPE_OPTS: StakeholderType[] = ['external', 'government', 'private', 'other'];
function typeLabel(t: string, ar: boolean) {
  const m: Record<string, [string, string]> = {
    external: ['External', 'خارجي'], government: ['Government', 'حكومي'],
    private: ['Private', 'قطاع خاص'], other: ['Other', 'أخرى'],
  };
  return m[t] ? (ar ? m[t][1] : m[t][0]) : t;
}
function typeColor(t: string) {
  switch (t) {
    case 'government': return 'bg-blue-100 text-blue-700';
    case 'private': return 'bg-purple-100 text-purple-700';
    case 'other': return 'bg-slate-100 text-slate-600';
    default: return 'bg-emerald-100 text-emerald-700';
  }
}

export function ChallengeStakeholders({ challengeId }: { challengeId: string }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ChallengeStakeholder | null>(null);

  const listQ = useQuery({
    queryKey: ['challenge-stakeholders', challengeId],
    queryFn: () => listChallengeStakeholders(challengeId),
  });
  const stakeholders = listQ.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['challenge-stakeholders', challengeId] });

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteChallengeStakeholder(id),
    onSuccess: refresh,
  });

  if (!user) return null;
  const isManager = user.role === 'admin' || user.role === 'super_admin';

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (s: ChallengeStakeholder) => { setEditing(s); setModalOpen(true); };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-1">
          <Users className="h-4 w-4" />{ar ? 'الأطراف المعنية' : 'Stakeholders'}
          <span className="text-slate-400 font-normal">({stakeholders.length})</span>
        </h3>
        {isManager && (
          <Button onClick={openAdd} variant="outline" className="gap-1 h-8 px-2 text-xs">
            <Plus className="h-3 w-3" />{ar ? 'إضافة' : 'Add'}
          </Button>
        )}
      </div>

      {listQ.isLoading && <p className="text-sm text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {!listQ.isLoading && stakeholders.length === 0 && (
        <p className="text-sm text-slate-400">{ar ? 'لم تُسجَّل أطراف بعد.' : 'No stakeholders registered yet.'}</p>
      )}

      <ul className="space-y-2">
        {stakeholders.map((s) => (
          <li key={s.id} className="rounded-md border border-slate-100 bg-slate-50/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800">{ar ? s.nameAr || s.name : s.name}</span>
                  <span className={'rounded px-1.5 py-0.5 text-xs ' + typeColor(s.type)}>{typeLabel(s.type, ar)}</span>
                </div>
                {(s.organizationName || s.role) && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {[s.role, s.organizationName].filter(Boolean).join(ar ? ' — ' : ' · ')}
                  </p>
                )}
                {s.email && (
                  <a href={'mailto:' + s.email} className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1 mt-0.5">
                    <Mail className="h-3 w-3" />{s.email}
                  </a>
                )}
                {s.notes && <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{s.notes}</p>}
              </div>
              {isManager && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(s)} className="text-slate-400 hover:text-indigo-600 p-1" title={ar ? 'تعديل' : 'Edit'}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm(ar ? 'حذف هذا الطرف؟' : 'Remove this stakeholder?')) removeMut.mutate(s.id); }}
                    className="text-slate-400 hover:text-red-600 p-1" title={ar ? 'حذف' : 'Remove'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {modalOpen && (
        <StakeholderModal
          challengeId={challengeId}
          editing={editing}
          ar={ar}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); refresh(); }}
        />
      )}
    </div>
  );
}

function StakeholderModal({ challengeId, editing, ar, onClose, onSaved }: {
  challengeId: string;
  editing: ChallengeStakeholder | null;
  ar: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [nameAr, setNameAr] = useState(editing?.nameAr ?? '');
  const [org, setOrg] = useState(editing?.organizationName ?? '');
  const [role, setRole] = useState(editing?.role ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [type, setType] = useState<StakeholderType>(editing?.type ?? 'external');
  const [notes, setNotes] = useState(editing?.notes ?? '');

  const saveMut = useMutation({
    mutationFn: () => {
      if (editing) {
        return updateChallengeStakeholder(editing.id, {
          name, nameAr, organizationName: org, role, email, type, notes,
        });
      }
      return createChallengeStakeholder({
        challengeId, name, nameAr, organizationName: org, role, email, type, notes,
      });
    },
    onSuccess: onSaved,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg my-8" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="font-semibold">{editing ? (ar ? 'تعديل طرف' : 'Edit stakeholder') : (ar ? 'إضافة طرف' : 'Add stakeholder')}</span>
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
            <div><label className={LBL}>{ar ? 'النوع' : 'Type'}</label>
              <select value={type} onChange={(e) => setType(e.target.value as StakeholderType)} className={IN}>
                {TYPE_OPTS.map((t) => <option key={t} value={t}>{typeLabel(t, ar)}</option>)}
              </select>
            </div>
          </div>
          <div><label className={LBL}>{ar ? 'ملاحظات' : 'Notes'}</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={IN} dir={ar ? 'rtl' : 'ltr'} /></div>
          {saveMut.isError && <p className="text-xs text-red-600">{(saveMut.error as Error).message}</p>}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
          <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>{ar ? 'إلغاء' : 'Cancel'}</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!name.trim() || saveMut.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{ar ? 'حفظ' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
