'use client';
// Contact import modal — upload a sheet, map its columns, review, import.
//
// Deliberately permissive (see parser.ts): the only row rejected is one with no
// name at all. Duplicates are NOT dropped — they are imported and flagged in the
// directory, because contacts arrive from many hands and silently losing a row
// is worse than showing two and letting a human decide.
import { useRef, useState } from 'react';
import { X, Upload, Download, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import {
  CONTACT_IMPORT_FIELDS,
  parseContactFile,
  autoMapContacts,
  buildContactInput,
  downloadContactTemplate,
  type ContactImportFieldKey,
  type ParsedContactSheet,
} from '@/lib/contacts/import/parser';
import { bulkCreateContacts, type ContactBulkSummary } from '@/lib/contacts/import/import-queries';
import type { ContactCreateInput } from '@/types/contact';

type Props = {
  onClose: () => void;
  onImported: () => void;
};

export function ContactImportModal({ onClose, onImported }: Props) {
  const { language } = useLanguage();
  const ar = language === 'ar';

  const [sheet, setSheet] = useState<ParsedContactSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, ContactImportFieldKey | ''>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ContactBulkSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseContactFile(file);
      if (!parsed || parsed.rows.length === 0) {
        throw new Error(ar ? 'الملف فارغ أو غير مقروء' : 'The file is empty or unreadable');
      }
      setSheet(parsed);
      setMapping(autoMapContacts(parsed.headers));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'parse_failed');
    } finally {
      setBusy(false);
    }
  }

  // Build what WOULD be imported, so the counts shown match what happens.
  const built = (() => {
    if (!sheet) return { valid: [] as ContactCreateInput[], invalid: 0 };
    const valid: ContactCreateInput[] = [];
    let invalid = 0;
    for (const row of sheet.rows) {
      const r = buildContactInput(row, mapping);
      if (r.ok) valid.push(r.input); else invalid++;
    }
    return { valid, invalid };
  })();

  async function runImport() {
    if (built.valid.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bulkCreateContacts(built.valid);
      setSummary(result);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'import_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <span className="font-semibold">
            {ar ? 'استيراد جهات الاتصال' : 'Import contacts'}
          </span>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* --- step 1: choose a file --- */}
          {!sheet && !summary && (
            <>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f); }}
                />
                {busy ? (
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
                <button onClick={downloadContactTemplate} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700">
                  <Download className="h-4 w-4" />{ar ? 'تنزيل القالب' : 'Download template'}
                </button>
                <span className="text-xs text-slate-400">{ar ? 'المطلوب فقط: الاسم' : 'Only needed: a name'}</span>
              </div>
            </>
          )}

          {/* --- step 2: map columns --- */}
          {sheet && !summary && (
            <>
              <div className="text-sm text-slate-600">
                {ar
                  ? `تم العثور على ${sheet.rows.length} صف. طابق أعمدة الملف مع الحقول:`
                  : `Found ${sheet.rows.length} rows. Match the file's columns to the fields:`}
              </div>

              <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {sheet.headers.map((h) => (
                  <div key={h} className="flex items-center gap-3 px-3 py-2">
                    <span className="text-sm text-slate-700 flex-1 truncate" title={h}>{h}</span>
                    <select
                      value={mapping[h] ?? ''}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [h]: e.target.value as ContactImportFieldKey | '' }))
                      }
                      className="h-8 rounded-md border border-slate-200 text-sm px-2 min-w-[180px]"
                    >
                      <option value="">{ar ? '— تجاهل —' : '— ignore —'}</option>
                      {CONTACT_IMPORT_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>{ar ? f.labelAr : f.labelEn}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span className="text-emerald-700">
                  {built.valid.length} {ar ? 'جاهز للاستيراد' : 'ready to import'}
                </span>
                {built.invalid > 0 && (
                  <span className="text-amber-700">
                    {built.invalid} {ar ? 'صف بلا اسم (سيتم تخطّيه)' : 'row(s) with no name (skipped)'}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500">
                {ar
                  ? 'تُستورد التكرارات ولا تُحذف — تُعلَّم في الدليل ليقرر المستخدم.'
                  : 'Duplicates are imported, not dropped — they are flagged in the directory for you to decide.'}
              </p>
            </>
          )}

          {/* --- step 3: result --- */}
          {summary && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">
                  {summary.created} {ar ? 'تم إنشاؤها' : 'created'}
                </span>
              </div>
              {summary.duplicates > 0 && (
                <div className="text-sm text-amber-700">
                  {summary.duplicates} {ar ? 'تطابق جهات موجودة (مُعلَّمة في الدليل)' : 'match existing contacts (flagged in the directory)'}
                </div>
              )}
              {summary.failed > 0 && (
                <div className="text-sm text-red-700">
                  {summary.failed} {ar ? 'فشل' : 'failed'}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {summary ? (ar ? 'إغلاق' : 'Close') : (ar ? 'إلغاء' : 'Cancel')}
          </Button>
          {sheet && !summary && (
            <Button
              onClick={runImport}
              disabled={busy || built.valid.length === 0}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {ar ? `استيراد ${built.valid.length}` : `Import ${built.valid.length}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
