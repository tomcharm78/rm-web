'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Link2, Users, Copy, Check, Loader2, Plus, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/providers/language-provider';
import { getSurvey } from '@/lib/surveys/queries';
import { listInvestors } from '@/lib/investors/queries';
import {
  listDistributions, createGenericDistribution, createInvestorDistribution, listInvestorTokens,
  type Distribution,
} from '@/lib/surveys/distribution-queries';

function publicUrl(token: string) {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/survey/${token}`;
}

export default function DistributePage() {
  const params = useParams();
  const surveyId = String(params.id);
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const surveyQ = useQuery({ queryKey: ['survey', surveyId], queryFn: () => getSurvey(surveyId) });
  const distQ = useQuery({ queryKey: ['distributions', surveyId], queryFn: () => listDistributions(surveyId) });
  const survey = surveyQ.data;
  const dists = distQ.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['distributions', surveyId] });

  const genMut = useMutation({
    mutationFn: () => createGenericDistribution(surveyId, ar ? 'رابط عام' : 'Generic link'),
    onSuccess: refresh,
  });

  if (surveyQ.isLoading) return <div className="p-8 text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>;
  if (!survey) return <div className="p-8 text-slate-400">{ar ? 'الاستبيان غير موجود' : 'Survey not found'}</div>;

  const genericDists = dists.filter((d) => d.channel === 'link');
  const investorDists = dists.filter((d) => d.channel === 'email');

  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-8">
      <Link href={`/surveys/${surveyId}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />{ar ? 'رجوع' : 'Back'}
      </Link>

      <h1 className="text-xl font-semibold text-slate-800 mb-1">{ar ? 'توزيع الاستبيان' : 'Distribute Survey'}</h1>
      <p className="text-sm text-slate-500 mb-6">{ar ? survey.titleAr || survey.title : survey.title || survey.titleAr}</p>

      {survey.status !== 'active' && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700 mb-6">
          {ar ? 'فعّل الاستبيان أولًا لتلقّي الاستجابات.' : 'Activate the survey first to collect responses.'}
        </div>
      )}

      {/* Generic link */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">{ar ? 'رابط عام (واتساب)' : 'Generic link (WhatsApp)'}</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">{ar ? 'رابط واحد قابل للمشاركة. أي شخص لديه الرابط يمكنه الإجابة.' : 'One shareable link. Anyone with it can answer.'}</p>

        {genericDists.map((d) => (
          <CopyRow key={d.id} url={d.genericToken ? publicUrl(d.genericToken) : ''} ar={ar} />
        ))}

        <Button onClick={() => genMut.mutate()} disabled={genMut.isPending} variant="outline" className="gap-2 mt-1">
          {genMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {ar ? 'إنشاء رابط عام' : 'Generate generic link'}
        </Button>
      </section>

      {/* Per-investor links */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">{ar ? 'روابط لكل مستثمر' : 'Per-investor links'}</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">{ar ? 'رابط مخصّص لكل مستثمر — تُنسب الاستجابة إليه تلقائيًا.' : 'A personalized link per investor — responses are attributed automatically.'}</p>

        <InvestorDistributionBuilder surveyId={surveyId} ar={ar} onCreated={refresh} />

        {investorDists.map((d) => (
          <InvestorDistRow key={d.id} dist={d} ar={ar} />
        ))}
      </section>
    </div>
  );
}

function CopyRow({ url, ar }: { url: string; ar: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!url) return null;
  return (
    <div className="flex items-center gap-2 mb-2 rounded-md bg-slate-50 border border-slate-100 px-2 py-1.5">
      <input readOnly value={url} className="flex-1 bg-transparent text-xs text-slate-600 outline-none" dir="ltr" onFocus={(e) => e.target.select()} />
      <button
        onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="text-slate-400 hover:text-indigo-600 shrink-0"
        title={ar ? 'نسخ' : 'Copy'}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function InvestorDistributionBuilder({ surveyId, ar, onCreated }: { surveyId: string; ar: boolean; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const investorsQ = useQuery({ queryKey: ['investors-for-survey'], queryFn: () => listInvestors({}), enabled: open });
  const investors = (investorsQ.data ?? []).filter((i) => (i.email ?? '').trim());

  const createMut = useMutation({
    mutationFn: () => createInvestorDistribution(surveyId, ar ? 'روابط المستثمرين' : 'Investor links', Array.from(selected)),
    onSuccess: () => { setSelected(new Set()); setOpen(false); onCreated(); },
  });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline" className="gap-2">
        <Plus className="h-4 w-4" />{ar ? 'إنشاء روابط للمستثمرين' : 'Generate investor links'}
      </Button>
    );
  }

  const filtered = investors.filter((i) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [i.companyName, i.companyNameAr, i.email].filter(Boolean).some((s) => s!.toLowerCase().includes(q));
  });
  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allSelected) filtered.forEach((i) => n.delete(i.id));
    else filtered.forEach((i) => n.add(i.id));
    return n;
  });

  return (
    <div className="rounded-md border border-slate-200 p-3 mb-3">
      <p className="text-xs text-slate-500 mb-2">{ar ? 'اختر المستثمرين (ذوي البريد فقط):' : 'Select investors (with email only):'}</p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={ar ? 'بحث بالاسم أو البريد…' : 'Search by name or email…'}
        className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <label className="flex items-center gap-2 px-2 py-1.5 text-sm border-b border-slate-100 cursor-pointer">
        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
        <span className="text-slate-600 font-medium">{ar ? `تحديد الكل (${filtered.length})` : `Select all (${filtered.length})`}</span>
      </label>
      <div className="max-h-48 overflow-y-auto border border-slate-100 rounded divide-y divide-slate-100 mb-3 mt-2">
        {investorsQ.isLoading && <p className="text-xs text-slate-400 p-2">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
        {filtered.map((i) => (
          <label key={i.id} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
            <input type="checkbox" checked={selected.has(i.id)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(i.id) ? n.delete(i.id) : n.add(i.id); return n; })} />
            <span className="truncate">{[i.companyName, i.companyNameAr].filter(Boolean).join(' — ') || (ar ? '(بدون اسم)' : '(no name)')}</span>
            <span className="text-xs text-slate-400 truncate ms-auto" dir="ltr">{i.email}</span>
          </label>
        ))}
        {!investorsQ.isLoading && filtered.length === 0 && (
          <p className="text-xs text-slate-400 p-2">{ar ? 'لا نتائج.' : 'No matches.'}</p>
        )}
      </div>
      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={() => { setOpen(false); setSelected(new Set()); }}>{ar ? 'إلغاء' : 'Cancel'}</Button>
        <Button onClick={() => createMut.mutate()} disabled={selected.size === 0 || createMut.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
          {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{ar ? `إنشاء (${selected.size})` : `Generate (${selected.size})`}
        </Button>
      </div>
    </div>
  );
}

function InvestorDistRow({ dist, ar }: { dist: Distribution; ar: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: number; fail: number } | null>(null);
  const sendMut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/send-survey-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributionId: dist.id, origin: window.location.origin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'send_failed');
      return data as { success: number; fail: number };
    },
    onSuccess: (d) => setSendResult({ success: d.success, fail: d.fail }),
  });
  const tokensQ = useQuery({
    queryKey: ['investor-tokens', dist.id],
    queryFn: () => listInvestorTokens(dist.id),
    enabled: expanded,
  });
  const tokens = tokensQ.data ?? [];

  return (
    <div className="rounded-md border border-slate-100 mb-2">
      <div className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm">
        <button onClick={() => setExpanded((x) => !x)} className="flex items-center gap-2 text-slate-700 min-w-0">
          <span className="truncate">{dist.label || (ar ? 'روابط المستثمرين' : 'Investor links')}</span>
          <span className="text-xs text-slate-400">{dist.tokenCount} {ar ? 'رابط' : 'links'}</span>
        </button>
        <button
          onClick={() => sendMut.mutate()}
          disabled={sendMut.isPending}
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 shrink-0"
        >
          {sendMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {ar ? 'إرسال الدعوات' : 'Send invitations'}
        </button>
      </div>
      {sendResult && (
        <p className="px-3 pb-2 text-xs text-slate-500">
          {ar ? `أُرسل: ${sendResult.success} · فشل: ${sendResult.fail}` : `Sent: ${sendResult.success} · Failed: ${sendResult.fail}`}
        </p>
      )}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {tokensQ.isLoading && <p className="text-xs text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
          {tokens.map((t) => (
            <div key={t.token} className="text-xs">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-slate-600 truncate">{t.name}</span>
                <span className="text-slate-400 truncate" dir="ltr">{t.email}</span>
              </div>
              <CopyRow url={publicUrl(t.token)} ar={ar} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
