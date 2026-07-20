// Excel (.xlsx) export for the contacts directory.
//
// Exports what is ON SCREEN — the filtered directory, which spans both contacts
// and investor representatives — rather than the contacts table alone. The
// directory is the thing the user is looking at, so that is the thing the export
// should match. A Source column keeps the two apart in the sheet.
//
// Uses SheetJS, already a dependency for the investors import — no new library.
// A real .xlsx rather than CSV because Arabic in CSV needs a byte-order mark to
// open correctly in Excel, and half the directory is Arabic.
import * as XLSX from 'xlsx';
import type { DirectoryEntry } from '@/types/contact';

const TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  internal_moh: { en: 'Internal (MOH)', ar: 'داخلي (الوزارة)' },
  external:     { en: 'External',        ar: 'خارجي' },
  government:   { en: 'Government',      ar: 'حكومي' },
  private:      { en: 'Private',         ar: 'قطاع خاص' },
  investor:     { en: 'Investor',        ar: 'مستثمر' },
  other:        { en: 'Other',           ar: 'أخرى' },
};

const typeLabel = (t: string, ar: boolean) =>
  TYPE_LABELS[t] ? (ar ? TYPE_LABELS[t].ar : TYPE_LABELS[t].en) : t;

export function exportDirectoryToExcel(entries: DirectoryEntry[], ar: boolean) {
  const headers = ar
    ? ['الاسم', 'الاسم (عربي)', 'البريد الإلكتروني', 'الهاتف', 'الجهة', 'المنصب', 'التصنيف', 'المصدر']
    : ['Name', 'Name (AR)', 'Email', 'Phone', 'Organization', 'Role', 'Type', 'Source'];

  const rows = entries.map((e) => [
    e.name,
    e.nameAr,
    e.email ?? '',
    e.phone,
    ar ? (e.organizationAr || e.organization) : e.organization,
    ar ? (e.roleAr || e.role) : e.role,
    typeLabel(e.type, ar),
    e.source === 'investor'
      ? (ar ? 'المستثمرون' : 'Investors')
      : (ar ? 'جهات الاتصال' : 'Contacts'),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Column widths — otherwise every column opens at the default narrow size and
  // the reader's first action is dragging borders.
  ws['!cols'] = [
    { wch: 26 }, { wch: 26 }, { wch: 30 }, { wch: 18 },
    { wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ar ? 'الدليل' : 'Directory');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `directory-${stamp}.xlsx`);
}
