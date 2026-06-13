// CSV export for investors. UTF-8 with BOM so Excel opens Arabic correctly.
//
// CSV mechanics:
//   - Comma separator
//   - Double quote field wrapping
//   - Doubled quotes inside fields ("don't" -> "don""t")
//   - Newlines and commas inside fields are preserved
//   - Leading BOM (\uFEFF) so Excel detects UTF-8 (otherwise Arabic appears
//     as ?????? when opened from Excel)
//
// Browser file download is handled by the caller — we return the string only.

import type { Investor } from '@/types/investor';
import { DOMAIN_LABELS } from '@/types/investor';

type CsvLanguage = 'en' | 'ar';

export function investorsToCsv(investors: Investor[], language: CsvLanguage = 'en'): string {
  const headers = language === 'ar'
    ? [
        'اسم الشركة (EN)',
        'اسم الشركة (AR)',
        'القطاع',
        'الجنسية',
        'الدولة',
        'المدينة',
        'الموقع الإلكتروني',
        'رقم السجل التجاري',
        'حجم المحفظة (USD)',
        'منطقة الاستثمار المفضلة',
        'اسم الممثل (EN)',
        'اسم الممثل (AR)',
        'المنصب (EN)',
        'المنصب (AR)',
        'البريد الإلكتروني',
        'الجوال',
        'الهاتف الثابت',
        'تاريخ الإنشاء',
        'تاريخ التعديل',
        'المصدر',
      ]
    : [
        'Company Name (EN)',
        'Company Name (AR)',
        'Domain',
        'Nationality',
        'Country',
        'City',
        'Website',
        'CR Number',
        'Portfolio Size (USD)',
        'Preferred Investment Region',
        'Representative Name (EN)',
        'Representative Name (AR)',
        'Position (EN)',
        'Position (AR)',
        'Email',
        'Mobile',
        'Fixed Line',
        'Created At',
        'Updated At',
        'Source',
      ];

  const rows = investors.map((inv) => [
    inv.companyName,
    inv.companyNameAr,
    language === 'ar' ? DOMAIN_LABELS[inv.domainType].ar : DOMAIN_LABELS[inv.domainType].en,
    inv.nationality,
    inv.country,
    inv.city,
    inv.website ?? '',
    inv.crNumber ?? '',
    inv.portfolioSizeUsd != null ? String(inv.portfolioSizeUsd) : '',
    inv.preferredInvestmentRegion ?? '',
    inv.representativeName,
    inv.representativeNameAr,
    inv.position,
    inv.positionAr,
    inv.email,
    `${inv.mobileCountryCode} ${inv.mobileNumber}`.trim(),
    inv.fixedCountryCode && inv.fixedNumber ? `${inv.fixedCountryCode} ${inv.fixedNumber}` : '',
    inv.createdAt.toISOString(),
    inv.updatedAt.toISOString(),
    inv.sourceSystem === 'mobile_scan' ? (language === 'ar' ? 'مسح بطاقة' : 'Mobile Scan') : (language === 'ar' ? 'يدوي' : 'Manual'),
  ]);

  const lines = [headers, ...rows].map((cells) =>
    cells.map((c) => csvEscape(String(c ?? ''))).join(',')
  );

  // BOM + content. \r\n line endings for max-compat with Windows Excel.
  return '\uFEFF' + lines.join('\r\n');
}

function csvEscape(value: string): string {
  // If the value contains a comma, quote, or newline, wrap it in quotes and
  // double any internal quotes.
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// Trigger a browser download of the CSV.
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a beat before revoking, otherwise Safari complains.
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
