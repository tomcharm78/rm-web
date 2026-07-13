'use client';
// REPORTS — export-only module.
// Pick a report → set parameters (scope, language, week for the weekly) → preview
// → export. Generation is CLIENT-SIDE: the report renders as HTML (the browser
// handles Arabic BiDi correctly), each .report-page is captured, jsPDF writes the
// file. RLS scopes the data automatically — no role logic needed here.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, Loader2, Settings2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { getOverallAlignment, getPerDepartmentAlignment } from '@/lib/kpi/dashboard-alignment-queries';
import { listAllDepartments } from '@/lib/dashboard/dept-queries';
import { getDepartmentBurden, getDepartmentChallenges } from '@/lib/reports/queries';
import {
  getWeeklyMovement, getWeeklyCapacity, getWeeklyAttention, getApprovalBottlenecks, weekWindow,
} from '@/lib/reports/weekly-queries';
import { getMyOrgContext } from '@/lib/org/queries';
import { DeptAlignmentReport, type ReportData } from '@/components/reports/dept-alignment-report';
import { WeeklyReport, type WeeklyData } from '@/components/reports/weekly-report';
import { DEFAULT_SETTINGS, type ReportSettings } from '@/components/reports/paginated-report';

const YEAR = new Date().getFullYear();
type ReportId = 'alignment' | 'weekly';
const LS_KEY = (lang: string) => `rm-report-settings-${lang}`;

export default function ReportsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const uiAr = language === 'ar';

  const wrapRef = useRef<HTMLDivElement>(null);
  const [reportId, setReportId] = useState<ReportId>('alignment');
  const [reportLang, setReportLang] = useState<'ar' | 'en'>(uiAr ? 'ar' : 'en');
  const [scopeDeptId, setScopeDeptId] = useState('');
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, -1 = last week
  const [settings, setSettings] = useState<ReportSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');

  const ar = reportLang === 'ar';
  const isWeekly = reportId === 'weekly';

  // Header/footer settings persist per report language.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY(reportLang));
      setSettings(raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS);
    } catch { setSettings(DEFAULT_SETTINGS); }
  }, [reportLang]);

  function updateSetting<K extends keyof ReportSettings>(key: K, value: ReportSettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    try { localStorage.setItem(LS_KEY(reportLang), JSON.stringify(next)); } catch { /* ignore */ }
  }

  const refDate = new Date();
  refDate.setDate(refDate.getDate() + weekOffset * 7);
  const { start, end } = weekWindow(refDate);
  const weekLabel = `${start.toISOString().slice(0, 10)} → ${new Date(end.getTime() - 86400000).toISOString().slice(0, 10)}`;

  // ---- shared
  const deptsQ = useQuery({ queryKey: ['all-depts'], queryFn: listAllDepartments });
  const orgQ = useQuery({ queryKey: ['my-org-context'], queryFn: getMyOrgContext });
  const burdenQ = useQuery({
    queryKey: ['report-burden', scopeDeptId || 'all'],
    queryFn: () => getDepartmentBurden(scopeDeptId || null),
  });

  // ---- report 1
  const overallQ = useQuery({ queryKey: ['align-overall', YEAR], queryFn: () => getOverallAlignment(YEAR), enabled: !isWeekly });
  const perDeptQ = useQuery({ queryKey: ['align-per-dept', YEAR], queryFn: () => getPerDepartmentAlignment(YEAR), enabled: !isWeekly });
  const challengesQ = useQuery({
    queryKey: ['report-challenges', scopeDeptId || 'all'],
    queryFn: () => getDepartmentChallenges(scopeDeptId || null),
    enabled: !isWeekly,
  });

  // ---- report 2 (weekly)
  const movementQ = useQuery({
    queryKey: ['weekly-movement', weekOffset],
    queryFn: () => getWeeklyMovement(refDate),
    enabled: isWeekly,
  });
  const capacityQ = useQuery({
    queryKey: ['weekly-capacity', weekOffset],
    queryFn: () => getWeeklyCapacity(refDate),
    enabled: isWeekly,
  });
  const attentionQ = useQuery({ queryKey: ['weekly-attention'], queryFn: getWeeklyAttention, enabled: isWeekly });
  const approvalsQ = useQuery({ queryKey: ['weekly-approvals'], queryFn: getApprovalBottlenecks, enabled: isWeekly });

  const loading = isWeekly
    ? movementQ.isLoading || capacityQ.isLoading || attentionQ.isLoading || approvalsQ.isLoading || burdenQ.isLoading
    : overallQ.isLoading || perDeptQ.isLoading || burdenQ.isLoading || challengesQ.isLoading;

  const depts = deptsQ.data ?? [];
  const scopeDept = depts.find((d) => d.id === scopeDeptId);
  const scopeLabel = scopeDept
    ? (ar ? scopeDept.nameAr || scopeDept.name : scopeDept.name)
    : ar ? 'جميع الإدارات' : 'All departments';

  const orgName = orgQ.data?.orgName ?? '';
  const orgNameAr = orgQ.data?.orgNameAr ?? '';

  const alignmentData: ReportData = {
    overall: overallQ.data ?? null,
    perDept: scopeDeptId
      ? (perDeptQ.data ?? []).filter((d) => d.departmentId === scopeDeptId)
      : (perDeptQ.data ?? []),
    burden: burdenQ.data ?? [],
    challenges: challengesQ.data ?? [],
    orgName, orgNameAr,
    periodLabel: String(YEAR),
    scopeLabel,
  };

  const weeklyData: WeeklyData | null = movementQ.data
    ? {
        movement: movementQ.data,
        capacity: capacityQ.data ?? [],
        burden: burdenQ.data ?? [],
        attention: attentionQ.data ?? [],
        approvals: approvalsQ.data ?? { pendingTotal: 0, oldestDays: 0, items: [] },
        orgName, orgNameAr,
        weekLabel,
        scopeLabel,
      }
    : null;

  async function exportPdf() {
    if (!wrapRef.current) return;
    setExporting(true);
    try {
      const pageEls = Array.from(wrapRef.current.querySelectorAll<HTMLElement>('.report-page'));
      if (!pageEls.length) throw new Error('no pages to export');

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pageEls.length; i++) {
        setStatus(uiAr ? `صفحة ${i + 1} / ${pageEls.length}` : `Page ${i + 1} / ${pageEls.length}`);
        const canvas = await html2canvas(pageEls[i], {
          scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
        });
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pw, ph);
      }

      const base = isWeekly
        ? (ar ? `التقرير-الأسبوعي-${weekLabel.slice(0, 10)}` : `weekly-report-${weekLabel.slice(0, 10)}`)
        : (ar ? `تقرير-المحاذاة-${YEAR}` : `alignment-report-${YEAR}`);
      pdf.save(base + '.pdf');
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
          <select className={SELECT} value={reportId} onChange={(e) => setReportId(e.target.value as ReportId)}>
            <option value="alignment">{uiAr ? 'محاذاة الإدارات والنشاط' : 'Department Alignment & Activity'}</option>
            <option value="weekly">{uiAr ? 'التقرير الأسبوعي' : 'Weekly Report'}</option>
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

        {isWeekly && (
          <div>
            <label className="block text-xs text-slate-600 mb-1">{uiAr ? 'الأسبوع' : 'Week'}</label>
            <select className={SELECT} value={weekOffset} onChange={(e) => setWeekOffset(Number(e.target.value))}>
              <option value={0}>{uiAr ? 'هذا الأسبوع' : 'This week'}</option>
              <option value={-1}>{uiAr ? 'الأسبوع الماضي' : 'Last week'}</option>
              <option value={-2}>{uiAr ? 'قبل أسبوعين' : '2 weeks ago'}</option>
            </select>
          </div>
        )}

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

      {/* Header/footer settings */}
      {showSettings && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
          <p className="text-xs text-slate-500">
            {uiAr
              ? `تُحفظ لكل لغة على حدة (الحالية: ${ar ? 'العربية' : 'الإنجليزية'}).`
              : `Saved per report language (currently: ${ar ? 'Arabic' : 'English'}).`}
          </p>
          <Field label={uiAr ? 'الترويسة (عريض)' : 'Header (bold)'} value={settings.headerText}
            onChange={(v) => updateSetting('headerText', v)} size={settings.headerSize} sizes={[14, 16]}
            onSize={(s) => updateSetting('headerSize', s as 14 | 16)} dir={ar ? 'rtl' : 'ltr'} />
          <Field label={uiAr ? 'الترويسة الفرعية' : 'Sub-header'} value={settings.subHeaderText}
            onChange={(v) => updateSetting('subHeaderText', v)} size={settings.subHeaderSize} sizes={[10, 12]}
            onSize={(s) => updateSetting('subHeaderSize', s as 10 | 12)} dir={ar ? 'rtl' : 'ltr'} />
          <Field label={uiAr ? 'التذييل (وسط)' : 'Footer (centred)'} value={settings.footerText}
            onChange={(v) => updateSetting('footerText', v)} size={settings.footerSize} sizes={[10, 12]}
            onSize={(s) => updateSetting('footerSize', s as 10 | 12)} dir={ar ? 'rtl' : 'ltr'} />
          <Field label={uiAr ? 'التذييل الفرعي' : 'Sub-footer'} value={settings.subFooterText}
            onChange={(v) => updateSetting('subFooterText', v)} size={settings.subFooterSize} sizes={[8, 9]}
            onSize={(s) => updateSetting('subFooterSize', s as 8 | 9)} dir={ar ? 'rtl' : 'ltr'} />
        </div>
      )}

      {/* Preview */}
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
              {isWeekly
                ? (weeklyData && <WeeklyReport data={weeklyData} ar={ar} settings={settings} />)
                : <DeptAlignmentReport data={alignmentData} ar={ar} settings={settings} />}
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
  label: string; value: string; onChange: (v: string) => void;
  size: number; sizes: number[]; onSize: (s: number) => void; dir: 'rtl' | 'ltr';
}) {
  return (
    <div className="flex items-end gap-3">
      <div className="flex-1">
        <label className="block text-xs text-slate-600 mb-1">{label}</label>
        <input dir={dir} value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
      </div>
      <div className="flex gap-1">
        {sizes.map((s) => (
          <button key={s} onClick={() => onSize(s)}
            className={'rounded-md border px-3 py-2 text-xs ' +
              (size === s ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

const SELECT =
  'rounded-md border border-slate-200 bg-white px-3 py-2 text-sm min-w-[190px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30';
