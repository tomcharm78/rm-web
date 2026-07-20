'use client';

import { useState, useRef, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Upload, FileSpreadsheet, Download, Loader2, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/providers/language-provider';
import {
  parseSpreadsheet, autoMap, buildInvestorInput, downloadImportTemplate,
  IMPORT_FIELDS, REQUIRED_FIELD_KEYS,
  type ParsedSheet, type ImportFieldKey,
} from '@/lib/investors/import/parser';
import { bulkCreateInvestors, type BulkImportSummary } from '@/lib/investors/import/import-queries';
import type { InvestorFormInput } from '@/types/investor';

type Step = 'upload' | 'map' | 'preview' | 'done';

const SEL = 'rounded-md border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500';

export function InvestorImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, ImportFieldKey | ''>>({});
  const [parsing, setParsing] = useState(false);
  const [summary, setSummary] = useState<BulkImportSummary | null>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const parsed = await parseSpreadsheet(file);
      setFileName(file.name);
      setSheet(parsed);
      setMapping(autoMap(parsed.headers));
      setStep('map');
    } catch {
      alert(ar ? 'تعذّر قراءة الملف.' : 'Could not read the file.');
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // which required fields are still unmapped (either-language rule:
  // need company in some language, representative in some language, + email)
  const unmappedRequired = useMemo(() => {
    const mapped = new Set(Object.values(mapping).filter(Boolean) as ImportFieldKey[]);
    const missing: string[] = [];
    if (!mapped.has('companyName') && !mapped.has('companyNameAr')) missing.push(ar ? 'اسم الشركة' : 'Company Name');
    if (!mapped.has('representativeName') && !mapped.has('representativeNameAr')) missing.push(ar ? 'اسم الممثل' : 'Representative Name');
    if (!mapped.has('email')) missing.push(ar ? 'البريد' : 'Email');
    return missing;
  }, [mapping, ar]);

  // build inputs + validation from the current mapping
  const built = useMemo(() => {
    if (!sheet) return { valid: [] as InvestorFormInput[], invalid: 0 };
    const valid: InvestorFormInput[] = [];
    let invalid = 0;
    for (const row of sheet.rows) {
      const r = buildInvestorInput(row, mapping);
      if (r.ok) valid.push(r.input); else invalid++;
    }
    return { valid, invalid };
  }, [sheet, mapping]);

  const importMut = useMutation({
    mutationFn: () => bulkCreateInvestors(built.valid),
    onSuccess: (s) => { setSummary(s); setStep('done'); onImported(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8" onMouseDown={(e) => e.stopPropagation()} dir={ar ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{ar ? 'استيراد المستثمرين' : 'Import Investors'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        {/* STEP: upload */}
        {step === 'upload' && (
          <div className="px-5 py-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center"
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {parsing ? (
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
              ) : (
                <>
                  <FileSpreadsheet className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  <Button onClick={() => fileRef.current?.click()} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                    <Upload className="h-4 w-4" />{ar ? 'اختر ملف Excel أو CSV' : 'Choose Excel or CSV file'}
                  </Button>
                  <p className="text-xs text-slate-400 mt-2">{ar ? 'أو اسحب الملف هنا' : 'or drag the file here'}</p>
                </>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <button onClick={downloadImportTemplate} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700">
                <Download className="h-4 w-4" />{ar ? 'تنزيل القالب' : 'Download template'}
              </button>
              <span className="text-xs text-slate-400">{ar ? 'المطلوب فقط: اسم الشركة أو الممثل' : 'Only needed: a company or representative name'}</span>
            </div>
          </div>
        )}

        {/* STEP: map */}
        {step === 'map' && sheet && (
          <div className="px-5 py-4">
            <p className="text-sm text-slate-600 mb-3">
              {ar ? `${fileName} · ${sheet.rows.length} صف` : `${fileName} · ${sheet.rows.length} rows`}
            </p>
            <p className="text-xs text-slate-500 mb-2">{ar ? 'طابِق أعمدة الملف مع حقول المستثمر:' : 'Match your file columns to investor fields:'}</p>
            <div className="max-h-[45vh] overflow-y-auto border border-slate-100 rounded-md divide-y divide-slate-100">
              {sheet.headers.map((h) => (
                <div key={h} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm text-slate-700 truncate max-w-[45%]" title={h}>{h || <em className="text-slate-300">(empty)</em>}</span>
                  <ArrowRight className="h-3 w-3 text-slate-300 shrink-0 rtl:rotate-180" />
                  <select
                    value={mapping[h] ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as ImportFieldKey | '' }))}
                    className={SEL + ' max-w-[45%]'}
                  >
                    <option value="">{ar ? '— تجاهل —' : '— ignore —'}</option>
                    {IMPORT_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>{(ar ? f.labelAr : f.labelEn) + (f.required ? ' *' : '')}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {unmappedRequired.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {ar ? 'حقول إلزامية غير مطابَقة: ' : 'Required fields not mapped: '}
                  {unmappedRequired.join('، ')}
                </span>
              </div>
            )}

            <div className="flex justify-between gap-2 mt-4">
              <Button variant="outline" onClick={() => setStep('upload')}>{ar ? 'رجوع' : 'Back'}</Button>
              <Button onClick={() => setStep('preview')} disabled={unmappedRequired.length > 0} className="bg-indigo-600 hover:bg-indigo-700">
                {ar ? 'معاينة' : 'Preview'}
              </Button>
            </div>
          </div>
        )}

        {/* STEP: preview */}
        {step === 'preview' && sheet && (
          <div className="px-5 py-4">
            <div className="grid grid-cols-3 gap-2 mb-4">
              <Stat label={ar ? 'جاهز' : 'Ready'} value={built.valid.length} tone="emerald" />
              <Stat label={ar ? 'تحتاج مراجعة' : 'Need attention'} value={built.invalid} tone="amber" />
              <Stat label={ar ? 'إجمالي الصفوف' : 'Total rows'} value={sheet.rows.length} tone="slate" />
            </div>
            {built.invalid > 0 && (
              <p className="text-xs text-amber-600 mb-3">
                {ar
                  ? `${built.invalid} صف بلا اسم شركة أو ممثل — يبدو أنها صفوف فارغة وسيتم تخطّيها.`
                  : `${built.invalid} row(s) have no company or representative name — these look like blank rows and will be skipped.`}
              </p>
            )}
            <p className="text-xs text-slate-500 mb-2">{ar ? 'عيّنة أول 5 صفوف:' : 'Preview of first 5 rows:'}</p>
            <div className="max-h-[35vh] overflow-auto border border-slate-100 rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-start">{ar ? 'الشركة' : 'Company'}</th>
                    <th className="px-2 py-1.5 text-start">{ar ? 'الممثل' : 'Representative'}</th>
                    <th className="px-2 py-1.5 text-start">{ar ? 'البريد' : 'Email'}</th>
                  </tr>
                </thead>
                <tbody>
                  {built.valid.slice(0, 5).map((inv, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{inv.companyName}</td>
                      <td className="px-2 py-1.5">{inv.representativeName}</td>
                      <td className="px-2 py-1.5" dir="ltr">{inv.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              {ar ? 'يُوسَم المستوردون بعلامة "تحميل" لإكمال بياناتهم لاحقًا. يُعدّ التكرار فقط عند تطابق البريد واسم الشركة معًا.' : 'Imported records are tagged “Upload” to complete later. A row counts as a duplicate only if BOTH the email and the company name already exist.'}
            </p>

            <div className="flex justify-between gap-2 mt-4">
              <Button variant="outline" onClick={() => setStep('map')}>{ar ? 'رجوع' : 'Back'}</Button>
              <Button onClick={() => importMut.mutate()} disabled={built.valid.length === 0 || importMut.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {ar ? `استيراد ${built.valid.length}` : `Import ${built.valid.length}`}
              </Button>
            </div>
          </div>
        )}

        {/* STEP: done */}
        {step === 'done' && summary && (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-slate-800 font-medium">{ar ? 'اكتمل الاستيراد' : 'Import complete'}</p>
            <div className="flex justify-center gap-4 mt-3 text-sm">
              <span className="text-emerald-600">{summary.created} {ar ? 'أُضيف' : 'created'}</span>
              <span className="text-slate-500">{summary.skippedDuplicate} {ar ? 'مكرّر (تخطّي)' : 'duplicates skipped'}</span>
              {summary.failed > 0 && <span className="text-red-600">{summary.failed} {ar ? 'فشل' : 'failed'}</span>}
            </div>
            <Button onClick={onClose} className="mt-5 bg-indigo-600 hover:bg-indigo-700">{ar ? 'إغلاق' : 'Close'}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'slate' }) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-50 text-slate-600',
  };
  return (
    <div className={'rounded-md px-3 py-2 text-center ' + tones[tone]}>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-[11px]">{label}</div>
    </div>
  );
}
