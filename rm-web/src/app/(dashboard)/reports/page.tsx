'use client';
// REPORTS — export-only module.
// Export captures EACH .report-page element separately → one PDF page each.
// No blind image slicing, so headers/footers stay intact and tables keep their
// repeated header rows.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, Loader2, Settings2 } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { getOverallAlignment, getPerDepartmentAlignment } from '@/lib/kpi/dashboard-alignment-queries';
import { listAllDepartments } from '@/lib/dashboard/dept-queries';
import { getDepartmentBurden, getDepartmentChallenges } from '@/lib/reports/queries';
import { getMyOrgContext } from '@/lib/org/queries';
import {
  DeptAlignmentReport,
  DEFAULT_SETTINGS,
  type ReportData,
  type ReportSettings,
} from '@/components/reports/dept-alignment-report';

const YEAR = new Date().getFullYear();
// Settings persist per language (an Arabic header differs from an English one).
const LS_KEY = (lang: string) => `rm-report-settings-${lang}`;

export default function ReportsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const uiAr = language === 'ar';

  const wrapRef = useRef<HTMLDivElement>(null);
  const [reportLang, setReportLang] = useState<'ar' | 'en'>(uiAr ? 'ar' : 'en');
  const [scopeDeptId, setScopeDeptId] = useState('');
  const [settings, setSettings] = useState<ReportSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');

  const ar = reportLang === 'ar';

  // Load persisted header/footer settings for the chosen report language.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY(reportLang));
      setSettings(raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS);
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, [reportLang]);

  function updateSetting<K extends keyof ReportSettings>(key: K, value: ReportSettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    try { localStorage.setItem(LS_KEY(reportLang), JSON.stringify(next)); } catch { /* ignore */ }
  }

  const deptsQ = useQuery({ queryKey: ['all-depts'], queryFn: listAllDepartments });
  const orgQ = useQuery({ queryKey: ['my-org-context'], queryFn: getMyOrgContext });
  const overallQ = useQuery({ queryKey: ['align-overall', YEAR], queryFn: () => getOverallAlignment(YEAR) });
  const perDeptQ = useQuery({ queryKey: ['align-per-dept', YEAR], queryFn: () => getPerDepartmentAlignment(YEAR) });
  const burdenQ = useQuery({
    queryKey: ['report-burden', scopeDeptId || 'all'],
    queryFn: () => getDepartmentBurden(scopeDeptId || null),
  });
  const challengesQ = useQuery({
    queryKey: ['report-challenges', scopeDeptId || 'all'],
    queryFn: () => getDepartmentChallenges(scopeDeptId || null),
  });

  const loading = overallQ.isLoading || perDeptQ.isLoading || burdenQ.isLoading || challengesQ.isLoading;
  const depts = deptsQ.data ?? [];
  const scopeDept = depts.find((d) => d.id === scopeDeptId);
  const scopeLabel = scopeDept
    ? (ar ? scopeDept.nameAr || scopeDept.name : scopeDept.name)
    : ar ? 'جميع الإدارات' : 'All departments';

  const data: ReportData = {
    overall: overallQ.data ?? null,
    perDept: scopeDeptId
      ? (perDeptQ.data ?? []).filter((d) => d.departmentId === scopeDeptId)
      : (perDeptQ.data ?? []),
    burden: burdenQ.data ?? [],
    challenges: challengesQ.data ?? [],
    orgName: orgQ.data?.orgName ?? '',
    orgNameAr: orgQ.data?.orgNameAr ?? '',
    periodLabel: String(YEAR),
    scopeLabel,
  };

  async function exportPdf() {
    if (!wrapRef.current) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const pageEls = Array.from(wrapRef.current.querySelectorAll<HTMLElement>('.report-page'));
      if (pageEls.length === 0) throw new Error('no pages to export');

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pageEls.length; i++) {
        setStatus(uiAr ? `صفحة ${i + 1} / ${pageEls.length}` : `Page ${i + 1} / ${pageEls.length}`);
        const canvas = await html2canvas(pageEls[i], {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
        });
        const img = canvas.toDataURL('image/png');
        if (i > 0) pdf.addPage();
        // Each captured page IS one A4 page — fill it edge to edge.
        pdf.addImage(img, 'PNG', 0, 0, pw, ph);
      }

      pdf.save(ar ? `تقرير-المحاذاة-${YEAR}.pdf` : `alignment-report-${YEAR}.pdf`);
      setStatus(uiAr ? 'تم التصدير ✓' : 'Exported ✓');
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      console.error('[reports export]', e);
      setStatus('ERROR: ' + (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" style={{ color: '#199e70' }} />
          {uiAr ? 'التقارير' : 'Reports'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {uiAr
            ? 'أنشئ التقارير وصدّرها. نطاق البيانات يتبع صلاحياتك تلقائيًا.'
            : 'Generate and export reports. Data scope follows your permissions automatically.'}
        </p>
      </div>

      {/* Parameters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-slate-600 mb-1">{uiAr ? 'التقرير' : 'Report'}</label>
          <select className={SELECT} disabled>
            <option>{uiAr ? 'محاذاة الإدارات والنشاط' : 'Department Alignment & Activity'}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">{uiAr ? 'النطاق' : 'Scope'}</label>
          <select className={SELECT} value={scopeDeptId} onChange={(e) => setScopeDeptId(e.target.value)}>
            <option value="">{uiAr ? 'جميع الإدارات' : 'All departments'}</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>{uiAr ? d.nameAr || d.name : d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">{uiAr ? 'لغة التقرير' : 'Report language'}</label>
          <select className={SELECT} value={reportLang} onChange={(e) => setReportLang(e.target.value as 'ar' | 'en')}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Settings2 className="h-4 w-4" />
          {uiAr ? 'الترويسة والتذييل' : 'Header & footer'}
        </button>
        <div className="ms-auto flex items-center gap-3">
          {status && <span className="text-xs text-slate-500">{status}</span>}
          <button
            onClick={exportPdf}
            disabled={exporting || loading}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm text-white disabled:opacity-50"
            style={{ background: '#199e70' }}
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {uiAr ? 'تصدير PDF' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* Header/footer settings — persisted per report language */}
      {showSettings && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
          <p className="text-xs text-slate-500">
            {uiAr
              ? `تُحفظ هذه الإعدادات لكل لغة على حدة (الحالية: ${ar ? 'العربية' : 'الإنجليزية'}).`
              : `Saved per report language (currently: ${ar ? 'Arabic' : 'English'}).`}
          </p>
          <Field
            label={uiAr ? 'الترويسة (عريض)' : 'Header (bold)'}
            value={settings.headerText}
            onChange={(v) => updateSetting('headerText', v)}
            size={settings.headerSize}
            sizes={[14, 16]}
            onSize={(s) => updateSetting('headerSize', s as 14 | 16)}
            dir={ar ? 'rtl' : 'ltr'}
          />
          <Field
            label={uiAr ? 'الترويسة الفرعية' : 'Sub-header'}
            value={settings.subHeaderText}
            onChange={(v) => updateSetting('subHeaderText', v)}
            size={settings.subHeaderSize}
            sizes={[10, 12]}
            onSize={(s) => updateSetting('subHeaderSize', s as 10 | 12)}
            dir={ar ? 'rtl' : 'ltr'}
          />
          <Field
            label={uiAr ? 'التذييل (وسط)' : 'Footer (centred)'}
            value={settings.footerText}
            onChange={(v) => updateSetting('footerText', v)}
            size={settings.footerSize}
            sizes={[10, 12]}
            onSize={(s) => updateSetting('footerSize', s as 10 | 12)}
            dir={ar ? 'rtl' : 'ltr'}
          />
          <Field
            label={uiAr ? 'التذييل الفرعي' : 'Sub-footer'}
            value={settings.subFooterText}
            onChange={(v) => updateSetting('subFooterText', v)}
            size={settings.subFooterSize}
            sizes={[8, 9]}
            onSize={(s) => updateSetting('subFooterSize', s as 8 | 9)}
            dir={ar ? 'rtl' : 'ltr'}
          />
        </div>
      )}

      {/* Preview — each page is a real A4 page */}
      <div>
        <div className="text-xs text-slate-500 mb-2">{uiAr ? 'معاينة' : 'Preview'}</div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 p-8">
            <Loader2 className="h-4 w-4 animate-spin" />
            {uiAr ? 'جارٍ تحميل البيانات…' : 'Loading data…'}
          </div>
        ) : (
          <div className="overflow-auto bg-slate-100 p-6 rounded-lg flex justify-center">
            <div ref={wrapRef}>
              <DeptAlignmentReport data={data} ar={ar} settings={settings} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, size, sizes, onSize, dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  size: number;
  sizes: number[];
  onSize: (s: number) => void;
  dir: 'rtl' | 'ltr';
}) {
  return (
    <div className="flex items-end gap-3">
      <div className="flex-1">
        <label className="block text-xs text-slate-600 mb-1">{label}</label>
        <input
          dir={dir}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>
      <div className="flex gap-1">
        {sizes.map((s) => (
          <button
            key={s}
            onClick={() => onSize(s)}
            className={
              'rounded-md border px-3 py-2 text-xs ' +
              (size === s ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50')
            }
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

const SELECT =
  'rounded-md border border-slate-200 bg-white px-3 py-2 text-sm min-w-[190px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30';
