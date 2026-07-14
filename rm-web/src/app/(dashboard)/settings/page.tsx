'use client';
// SETTINGS.
//
// Four sections, with different audiences:
//   Modules      — PLATFORM OWNER only (the can_manage_modules holder). These
//                  toggles previously required SQL.
//   Tech Support — everyone can file; only the owner sees the inbox and closes.
//                  Requests flow from the customer's staff UP to the vendor.
//   Theme        — placeholder; built later.
//   How to use   — in-app documentation.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Settings as SettingsIcon, LifeBuoy, Palette, BookOpen, ToggleLeft,
  Loader2, Check, Paperclip,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { getMyModulesControl, setModuleEnabled } from '@/lib/modules/queries';
import {
  createSupportRequest, listSupportRequests, closeSupportRequest,
  type SupportRequest,
} from '@/lib/support/queries';
import { SupportForm } from '@/components/settings/support-form';
import { HowToUse } from '@/components/settings/how-to-use';

type Tab = 'support' | 'modules' | 'theme' | 'docs';

export default function SettingsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const ctlQ = useQuery({ queryKey: ['my-modules-control'], queryFn: getMyModulesControl });
  const isOwner = ctlQ.data?.canManage ?? false;

  const [tab, setTab] = useState<Tab>('support');

  const TABS: { id: Tab; icon: typeof LifeBuoy; en: string; ar: string; ownerOnly?: boolean }[] = [
    { id: 'support', icon: LifeBuoy, en: 'Tech support', ar: 'الدعم الفني' },
    { id: 'modules', icon: ToggleLeft, en: 'Modules', ar: 'الوحدات', ownerOnly: true },
    { id: 'theme', icon: Palette, en: 'Theme', ar: 'المظهر' },
    { id: 'docs', icon: BookOpen, en: 'How to use', ar: 'كيفية الاستخدام' },
  ];
  const visibleTabs = TABS.filter((t) => !t.ownerOnly || isOwner);

  if (!user) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <SettingsIcon className="h-5 w-5 text-slate-500" />
          {ar ? 'الإعدادات' : 'Settings'}
        </h1>
      </div>

      {/* tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'inline-flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px ' +
                (active
                  ? 'border-slate-900 text-slate-900 font-medium'
                  : 'border-transparent text-slate-500 hover:text-slate-700')
              }
            >
              <Icon className="h-4 w-4" />
              {ar ? t.ar : t.en}
            </button>
          );
        })}
      </div>

      {tab === 'support' && <SupportSection isOwner={isOwner} ar={ar} />}
      {tab === 'modules' && isOwner && <ModulesSection ar={ar} qc={qc} />}
      {tab === 'theme' && <ThemeSection ar={ar} />}
      {tab === 'docs' && <HowToUse ar={ar} />}
    </div>
  );
}

// ---------------------------------------------------------------- SUPPORT
function SupportSection({ isOwner, ar }: { isOwner: boolean; ar: boolean }) {
  const qc = useQueryClient();
  const [view, setView] = useState<'new' | 'mine' | 'inbox'>(isOwner ? 'inbox' : 'new');

  const listQ = useQuery({
    queryKey: ['support-requests'],
    queryFn: () => listSupportRequests(),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setView('new')}
          className={btnTab(view === 'new')}
        >
          {ar ? 'طلب دعم جديد' : 'New request'}
        </button>
        <button
          onClick={() => setView(isOwner ? 'inbox' : 'mine')}
          className={btnTab(view !== 'new')}
        >
          {isOwner
            ? (ar ? 'صندوق الدعم' : 'Support inbox')
            : (ar ? 'طلباتي' : 'My requests')}
        </button>
      </div>

      {view === 'new' ? (
        <SupportForm
          ar={ar}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['support-requests'] });
            setView(isOwner ? 'inbox' : 'mine');
          }}
        />
      ) : (
        <SupportList
          ar={ar}
          isOwner={isOwner}
          requests={listQ.data ?? []}
          loading={listQ.isLoading}
          onChanged={() => qc.invalidateQueries({ queryKey: ['support-requests'] })}
        />
      )}
    </div>
  );
}

function SupportList({
  ar, isOwner, requests, loading, onChanged,
}: {
  ar: boolean;
  isOwner: boolean;
  requests: SupportRequest[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading) {
    return <div className="p-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
        {ar ? 'لا توجد طلبات.' : 'No requests.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => {
        const open = r.status === 'open';
        return (
          <div key={r.id} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded ' +
                    (open ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700')
                  }>
                    {open ? (ar ? 'مفتوح' : 'OPEN') : (ar ? 'مغلق' : 'CLOSED')}
                  </span>
                  <span className="text-sm font-medium">{r.moduleKey}</span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500">{r.activity}</span>
                </div>
                <p className="text-sm text-slate-700 mt-1">{r.problem}</p>
                {r.details && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{r.details}</p>}
                {r.attachmentPath && (
                  <div className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                    <Paperclip className="h-3 w-3" />
                    {ar ? 'صورة مرفقة' : 'Screenshot attached'}
                  </div>
                )}
                {isOwner && (
                  <details className="mt-2">
                    <summary className="text-xs text-slate-400 cursor-pointer">
                      {ar ? 'السياق التقني' : 'Technical context'}
                    </summary>
                    <pre className="mt-1 text-[10px] text-slate-500 bg-slate-50 p-2 rounded overflow-auto">
                      {JSON.stringify(r.context, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <div className="text-end flex-shrink-0">
                <div className="text-xs text-slate-500">{r.requesterName}</div>
                <div className="text-[11px] text-slate-400">{r.requesterRole}</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {new Date(r.createdAt).toLocaleDateString(ar ? 'ar' : 'en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </div>
              </div>
            </div>

            {r.response && (
              <div className="mt-3 rounded-md bg-green-50 border border-green-100 p-3">
                <div className="text-[11px] font-semibold text-green-800 mb-1">
                  {ar ? 'الرد' : 'Response'}
                </div>
                <p className="text-sm text-green-900 whitespace-pre-wrap">{r.response}</p>
              </div>
            )}

            {isOwner && open && (
              replyFor === r.id ? (
                <div className="mt-3">
                  <textarea
                    dir={ar ? 'rtl' : 'ltr'}
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={ar ? 'اكتب الرد ثم أغلق الطلب…' : 'Write your response, then close the request…'}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <div className="mt-2 flex gap-2 justify-end">
                    <button
                      onClick={() => { setReplyFor(null); setReply(''); }}
                      className="text-xs px-3 py-1.5 rounded-md border border-slate-200"
                    >
                      {ar ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      disabled={!reply.trim() || saving}
                      onClick={async () => {
                        setSaving(true);
                        try {
                          await closeSupportRequest(r.id, reply);
                          setReplyFor(null);
                          setReply('');
                          onChanged();
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className="text-xs px-3 py-1.5 rounded-md bg-slate-900 text-white disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      {ar ? 'رد وإغلاق' : 'Reply & close'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setReplyFor(r.id)}
                  className="mt-3 text-xs px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50"
                >
                  {ar ? 'رد وإغلاق' : 'Reply & close'}
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- MODULES
const MODULE_LABELS: Record<string, [string, string]> = {
  reports: ['Reports', 'التقارير'],
  kpis: ['KPIs', 'مؤشرات الأداء'],
  approvals: ['Approvals', 'الموافقات'],
  vacations: ['Vacations', 'الإجازات'],
  exports: ['Exports', 'التصدير'],
  emails: ['Email', 'البريد'],
  survey: ['Surveys', 'الاستبيانات'],
  attachments: ['Attachments', 'المرفقات'],
  community: ['Community', 'المجتمع'],
  events: ['Events', 'الفعاليات'],
  hr_training: ['HR & Training', 'الموارد البشرية والتدريب'],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ModulesSection({ ar, qc }: { ar: boolean; qc: any }) {
  const ctlQ = useQuery({ queryKey: ['my-modules-control'], queryFn: getMyModulesControl });
  const [busy, setBusy] = useState<string | null>(null);

  const settings = ctlQ.data?.settings ?? {};
  const orgId = ctlQ.data?.organizationId;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <p className="text-xs text-slate-500 mb-4">
        {ar
          ? 'تحكّم في الوحدات المتاحة لهذه الجهة. الإيقاف يُخفي الوحدة من التنقل ويمنع الوصول إليها.'
          : 'Control which modules this organisation has. Disabling hides the module from navigation and blocks access.'}
      </p>
      <div className="space-y-1">
        {Object.entries(MODULE_LABELS).map(([key, [en, arLabel]]) => {
          const enabled = !!settings[key];
          return (
            <div key={key} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <span className="text-sm">{ar ? arLabel : en}</span>
              <button
                disabled={busy === key || !orgId}
                onClick={async () => {
                  if (!orgId) return;
                  setBusy(key);
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await setModuleEnabled(orgId, key as any, !enabled);
                    qc.invalidateQueries({ queryKey: ['my-modules-control'] });
                  } finally {
                    setBusy(null);
                  }
                }}
                className={
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors ' +
                  (enabled ? 'bg-emerald-600' : 'bg-slate-200') +
                  (busy === key ? ' opacity-50' : '')
                }
              >
                <span
                  className={
                    'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ' +
                    (enabled ? 'translate-x-5' : 'translate-x-1')
                  }
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- THEME
function ThemeSection({ ar }: { ar: boolean }) {
  const THEMES = [
    { id: 'professional', en: 'Professional', ar: 'احترافي', note: ar ? 'الحالي' : 'Current' },
    { id: 'moh', en: 'MOH', ar: 'وزارة الصحة', note: ar ? 'قريبًا' : 'Soon' },
    { id: 'national', en: 'Saudi National Day', ar: 'اليوم الوطني', note: ar ? 'قريبًا' : 'Soon' },
    { id: 'daynight', en: 'Day / Night', ar: 'نهاري / ليلي', note: ar ? 'قريبًا' : 'Soon' },
  ];
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <p className="text-xs text-slate-500 mb-4">
        {ar ? 'اختر مظهر المنصة.' : 'Choose the platform’s appearance.'}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {THEMES.map((t) => {
          const current = t.id === 'professional';
          return (
            <div
              key={t.id}
              className={
                'rounded-lg border p-4 text-center ' +
                (current ? 'border-slate-900' : 'border-slate-200 opacity-50')
              }
            >
              <div className="text-sm font-medium">{ar ? t.ar : t.en}</div>
              <div className="text-[11px] text-slate-400 mt-1">{t.note}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function btnTab(active: boolean) {
  return (
    'px-3 py-1.5 text-sm rounded-md border ' +
    (active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50')
  );
}
