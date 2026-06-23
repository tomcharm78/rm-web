'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Loader2, X, Pencil, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { listUserNames } from '@/lib/tasks/queries';
import {
  listChallenges, createChallenge, updateChallenge, archiveChallenge, listChallengeDomains,
} from '@/lib/challenges/queries';
import type { Challenge, ChallengeStatus, ChallengeType, ChallengePriority } from '@/types/challenge';

const FILTER_CLS = 'h-9 rounded-md border border-slate-200 bg-white px-3 text-sm';
const LBL = 'text-xs text-slate-600';
const IN = 'w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

const STATUS_OPTS: ChallengeStatus[] = ['open', 'investigating', 'mitigation_in_progress', 'resolved', 'closed'];
const TYPE_OPTS: ChallengeType[] = ['financial', 'technical', 'operational', 'insurance', 'regulatory', 'hr_training', 'others'];
const PRIORITY_OPTS: ChallengePriority[] = ['low', 'medium', 'high', 'critical'];

function statusLabel(s: string, ar: boolean) {
  const m: Record<string, [string, string]> = {
    open: ['Open', 'مفتوح'], investigating: ['Investigating', 'قيد الدراسة'],
    mitigation_in_progress: ['Mitigation', 'قيد المعالجة'], resolved: ['Resolved', 'تم الحل'], closed: ['Closed', 'مغلق'],
  };
  return m[s] ? (ar ? m[s][1] : m[s][0]) : s;
}
function typeLabel(t: string, ar: boolean) {
  const m: Record<string, [string, string]> = {
    financial: ['Financial', 'مالي'], technical: ['Technical', 'تقني'], operational: ['Operational', 'تشغيلي'],
    insurance: ['Insurance', 'تأمين'], regulatory: ['Regulatory', 'تنظيمي'], hr_training: ['HR & Training', 'موارد وتدريب'], others: ['Others', 'أخرى'],
  };
  return m[t] ? (ar ? m[t][1] : m[t][0]) : t;
}
function priorityLabel(p: string, ar: boolean) {
  const m: Record<string, [string, string]> = {
    low: ['Low', 'منخفض'], medium: ['Medium', 'متوسط'], high: ['High', 'مرتفع'], critical: ['Critical', 'حرج'],
  };
  return m[p] ? (ar ? m[p][1] : m[p][0]) : p;
}
function statusColor(s: string) {
  switch (s) {
    case 'investigating': return 'bg-blue-100 text-blue-700';
    case 'mitigation_in_progress': return 'bg-amber-100 text-amber-700';
    case 'resolved': return 'bg-green-100 text-green-700';
    case 'closed': return 'bg-slate-200 text-slate-600';
    default: return 'bg-slate-100 text-slate-700';
  }
}

export default function ChallengesPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const router = useRouter();
  const qc = useQueryClient();

  const [fStatus, setFStatus] = useState('');
  const [fType, setFType] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fDomain, setFDomain] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [editing, setEditing] = useState<Challenge | null>(null);

  const challengesQ = useQuery({
    queryKey: ['challenges', fStatus, fType, fPriority, fDomain],
    queryFn: () => listChallenges({
      status: (fStatus || undefined) as ChallengeStatus | undefined,
      type: (fType || undefined) as ChallengeType | undefined,
      priority: (fPriority || undefined) as ChallengePriority | undefined,
      domainId: fDomain || undefined,
    }),
  });
  const domainsQ = useQuery({ queryKey: ['challenge-domains'], queryFn: listChallengeDomains });
  const namesQ = useQuery({ queryKey: ['user-names'], queryFn: listUserNames });

  const challenges = challengesQ.data ?? [];
  const domains = domainsQ.data ?? [];
  const names = namesQ.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['challenges'] });

  const archiveMut = useMutation({
    mutationFn: (id: string) => archiveChallenge(id),
    onSuccess: refresh,
  });

  const nameOf = (id?: string | null) => {
    if (!id) return '—';
    const u = names.find((n) => n.id === id);
    return u ? (ar ? u.nameAr || u.name : u.name) : '—';
  };
  const domainOf = (id?: string | null) => {
    if (!id) return '—';
    const d = domains.find((x) => x.id === id);
    return d ? (ar ? d.nameAr || d.name : d.name) : '—';
  };

  if (!user) return null;
  const isManager = user.role === 'admin' || user.role === 'super_admin';
  const isSuper = user.role === 'super_admin';

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-indigo-600" />
          <h1 className="text-xl font-semibold">{ar ? 'التحديات' : 'Challenges'}</h1>
          <span className="text-sm text-slate-400">({challenges.length})</span>
        </div>
        <Button onClick={() => setReportOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
          <Plus className="h-4 w-4" />{ar ? 'رفع تحدٍّ' : 'Report a challenge'}
        </Button>
      </div>
      <p className="text-sm text-slate-500 mb-5">{ar ? 'القضايا الاستراتيجية متعددة الجهات.' : 'Strategic, multi-stakeholder cases.'}</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={FILTER_CLS}>
          <option value="">{ar ? 'كل الحالات' : 'All statuses'}</option>
          {STATUS_OPTS.map((s) => <option key={s} value={s}>{statusLabel(s, ar)}</option>)}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className={FILTER_CLS}>
          <option value="">{ar ? 'كل الأنواع' : 'All types'}</option>
          {TYPE_OPTS.map((t) => <option key={t} value={t}>{typeLabel(t, ar)}</option>)}
        </select>
        <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className={FILTER_CLS}>
          <option value="">{ar ? 'كل الأولويات' : 'All priorities'}</option>
          {PRIORITY_OPTS.map((p) => <option key={p} value={p}>{priorityLabel(p, ar)}</option>)}
        </select>
        <select value={fDomain} onChange={(e) => setFDomain(e.target.value)} className={FILTER_CLS}>
          <option value="">{ar ? 'كل المجالات' : 'All domains'}</option>
          {domains.map((d) => <option key={d.id} value={d.id}>{ar ? d.nameAr || d.name : d.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3">{ar ? 'العنوان' : 'Title'}</th>
              <th className="px-4 py-3">{ar ? 'النوع' : 'Type'}</th>
              <th className="px-4 py-3">{ar ? 'الأولوية' : 'Priority'}</th>
              <th className="px-4 py-3">{ar ? 'الحالة' : 'Status'}</th>
              <th className="px-4 py-3">{ar ? 'المجال' : 'Domain'}</th>
              <th className="px-4 py-3">{ar ? 'المسؤول' : 'Owner'}</th>
              <th className="px-4 py-3">%</th>
              {isManager && <th className="px-4 py-3 text-right">{ar ? 'إجراءات' : 'Actions'}</th>}
            </tr>
          </thead>
          <tbody>
            {challengesQ.isLoading && (
              <tr><td colSpan={isManager ? 8 : 7} className="px-4 py-6 text-center text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</td></tr>
            )}
            {!challengesQ.isLoading && challenges.length === 0 && (
              <tr><td colSpan={isManager ? 8 : 7} className="px-4 py-6 text-center text-slate-400">{ar ? 'لا توجد تحديات' : 'No challenges yet'}</td></tr>
            )}
            {challenges.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800 cursor-pointer" onClick={() => router.push('/challenges/' + c.id)}>{ar ? c.titleAr || c.title : c.title}</td>
                <td className="px-4 py-3 text-slate-600 cursor-pointer" onClick={() => router.push('/challenges/' + c.id)}>{typeLabel(c.type, ar)}</td>
                <td className="px-4 py-3 text-slate-600 cursor-pointer" onClick={() => router.push('/challenges/' + c.id)}>{priorityLabel(c.priority, ar)}</td>
                <td className="px-4 py-3 cursor-pointer" onClick={() => router.push('/challenges/' + c.id)}><span className={'rounded px-2 py-0.5 text-xs ' + statusColor(c.status)}>{statusLabel(c.status, ar)}</span></td>
                <td className="px-4 py-3 text-slate-600 cursor-pointer" onClick={() => router.push('/challenges/' + c.id)}>{domainOf(c.domainId)}</td>
                <td className="px-4 py-3 text-slate-600 cursor-pointer" onClick={() => router.push('/challenges/' + c.id)}>{nameOf(c.assignedToId)}</td>
                <td className="px-4 py-3 text-slate-600 cursor-pointer" onClick={() => router.push('/challenges/' + c.id)}>{c.completionPercentage}%</td>
                {isManager && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing(c)} className="text-slate-400 hover:text-indigo-600 p-1" title={ar ? 'تعديل' : 'Edit'}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      {isSuper && (
                        <button
                          onClick={() => { if (confirm(ar ? 'أرشفة هذا التحدي؟ سيُخفى من القائمة.' : 'Archive this challenge? It will be hidden from the list.')) archiveMut.mutate(c.id); }}
                          className="text-slate-400 hover:text-amber-600 p-1" title={ar ? 'أرشفة' : 'Archive'}
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reportOpen && (
        <ChallengeModal
          domains={domains}
          ar={ar}
          editing={null}
          onClose={() => setReportOpen(false)}
          onSaved={() => { setReportOpen(false); refresh(); }}
        />
      )}
      {editing && (
        <ChallengeModal
          domains={domains}
          ar={ar}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function ChallengeModal({ domains, ar, editing, onClose, onSaved }: {
  domains: { id: string; name: string; nameAr: string }[];
  ar: boolean;
  editing: Challenge | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const [title, setTitle] = useState(editing?.title ?? '');
  const [titleAr, setTitleAr] = useState(editing?.titleAr ?? '');
  const [desc, setDesc] = useState(editing?.description ?? '');
  const [descAr, setDescAr] = useState(editing?.descriptionAr ?? '');
  const [type, setType] = useState<ChallengeType | ''>(editing?.type ?? '');
  const [priority, setPriority] = useState<ChallengePriority>(editing?.priority ?? 'medium');
  const [domainId, setDomainId] = useState(editing?.domainId ?? '');

  const saveMut = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return updateChallenge(editing!.id, {
          title, titleAr, description: desc, descriptionAr: descAr,
          type: type as ChallengeType, priority, domainId,
        });
      }
      return createChallenge({
        title, titleAr, description: desc, descriptionAr: descAr,
        type: type as ChallengeType, priority, domainId,
      });
    },
    onSuccess: onSaved,
  });
  const valid = title.trim() && titleAr.trim() && type && domainId;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg my-8" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="font-semibold">{isEdit ? (ar ? 'تعديل تحدٍّ' : 'Edit challenge') : (ar ? 'رفع تحدٍّ' : 'Report a challenge')}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LBL}>{ar ? 'العنوان (EN)' : 'Title (EN)'} *</label><input value={title} onChange={(e) => setTitle(e.target.value)} className={IN} /></div>
            <div><label className={LBL}>{ar ? 'العنوان (AR)' : 'Title (AR)'} *</label><input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" className={IN} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LBL}>{ar ? 'الوصف (EN)' : 'Description (EN)'}</label><textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className={IN} /></div>
            <div><label className={LBL}>{ar ? 'الوصف (AR)' : 'Description (AR)'}</label><textarea value={descAr} onChange={(e) => setDescAr(e.target.value)} dir="rtl" rows={3} className={IN} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={LBL}>{ar ? 'النوع' : 'Type'} *</label>
              <select value={type} onChange={(e) => setType(e.target.value as ChallengeType)} className={IN}>
                <option value="">—</option>
                {TYPE_OPTS.map((t) => <option key={t} value={t}>{typeLabel(t, ar)}</option>)}
              </select>
            </div>
            <div><label className={LBL}>{ar ? 'الأولوية' : 'Priority'}</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as ChallengePriority)} className={IN}>
                {PRIORITY_OPTS.map((p) => <option key={p} value={p}>{priorityLabel(p, ar)}</option>)}
              </select>
            </div>
            <div><label className={LBL}>{ar ? 'المجال' : 'Domain'} *</label>
              <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className={IN}>
                <option value="">—</option>
                {domains.map((d) => <option key={d.id} value={d.id}>{ar ? d.nameAr || d.name : d.name}</option>)}
              </select>
            </div>
          </div>
          {saveMut.isError && <p className="text-xs text-red-600">{(saveMut.error as Error)?.message}</p>}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
          <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>{ar ? 'إلغاء' : 'Cancel'}</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!valid || saveMut.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{isEdit ? (ar ? 'حفظ' : 'Save') : (ar ? 'رفع' : 'Submit')}
          </Button>
        </div>
      </div>
    </div>
  );
}
