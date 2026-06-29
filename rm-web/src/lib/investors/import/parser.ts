// Investor bulk-import — field registry, file parser, and smart header matching.
// Reuses the same InvestorFormInput the manual form produces.

import * as XLSX from 'xlsx';
import {
  INVESTOR_DOMAINS, DOMAIN_LABELS,
  type InvestorDomain, type InvestorFormInput,
} from '@/types/investor';

// Which InvestorFormInput fields are importable, with labels for the
// mapping UI + template, and whether each is part of the required minimum.
export type ImportFieldKey = keyof InvestorFormInput;

export type ImportFieldDef = {
  key: ImportFieldKey;
  labelEn: string;
  labelAr: string;
  required: boolean;   // part of the minimum needed to accept a row
};

export const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'companyName',             labelEn: 'Company Name (EN)',        labelAr: 'اسم الشركة',              required: true },
  { key: 'representativeName',      labelEn: 'Representative Name (EN)', labelAr: 'اسم الممثل',              required: true },
  { key: 'email',                   labelEn: 'Email',                    labelAr: 'البريد الإلكتروني',       required: true },
  { key: 'companyNameAr',           labelEn: 'Company Name (AR)',        labelAr: 'اسم الشركة (عربي)',        required: false },
  { key: 'representativeNameAr',    labelEn: 'Representative Name (AR)', labelAr: 'اسم الممثل (عربي)',        required: false },
  { key: 'domainType',              labelEn: 'Domain',                   labelAr: 'القطاع',                  required: false },
  { key: 'position',                labelEn: 'Position (EN)',            labelAr: 'المنصب',                  required: false },
  { key: 'positionAr',              labelEn: 'Position (AR)',            labelAr: 'المنصب (عربي)',           required: false },
  { key: 'nationality',             labelEn: 'Nationality',              labelAr: 'الجنسية',                 required: false },
  { key: 'country',                 labelEn: 'Country',                  labelAr: 'الدولة',                  required: false },
  { key: 'city',                    labelEn: 'City',                     labelAr: 'المدينة',                 required: false },
  { key: 'mobileCountryCode',       labelEn: 'Mobile Country Code',      labelAr: 'رمز الدولة (جوال)',        required: false },
  { key: 'mobileNumber',            labelEn: 'Mobile Number',            labelAr: 'رقم الجوال',              required: false },
  { key: 'portfolioSizeUsd',        labelEn: 'Portfolio Size (USD)',     labelAr: 'حجم المحفظة (دولار)',      required: false },
  { key: 'website',                 labelEn: 'Website',                  labelAr: 'الموقع الإلكتروني',       required: false },
  { key: 'crNumber',                labelEn: 'CR Number',                labelAr: 'رقم السجل التجاري',        required: false },
  { key: 'preferredInvestmentRegion', labelEn: 'Preferred Region',      labelAr: 'المنطقة المفضّلة',         required: false },
  { key: 'fixedCountryCode',        labelEn: 'Fixed Country Code',       labelAr: 'رمز الدولة (ثابت)',        required: false },
  { key: 'fixedNumber',             labelEn: 'Fixed Number',             labelAr: 'الهاتف الثابت',           required: false },
];

export const REQUIRED_FIELD_KEYS = IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key);

// ---- parsing ----

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
};

export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };
  const ws = wb.Sheets[firstSheetName];
  // header:1 → array-of-arrays so we can read the header row explicitly
  const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: '' });
  if (aoa.length === 0) return { headers: [], rows: [] };
  const headers = (aoa[0] ?? []).map((h) => String(h ?? '').trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    // skip fully empty rows
    if (r.every((c) => String(c ?? '').trim() === '')) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = String(r[idx] ?? '').trim(); });
    rows.push(obj);
  }
  return { headers, rows };
}

// ---- smart header → field matching ----

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_\-()]+/g, '').replace(/[^\w\u0600-\u06FF]/g, '');
}

// guess which import field a sheet header maps to (EN + AR aware). Returns null if no good match.
export function guessFieldForHeader(header: string): ImportFieldKey | null {
  const h = norm(header);
  if (!h) return null;
  for (const f of IMPORT_FIELDS) {
    const candidates = [f.key, f.labelEn, f.labelAr].map(norm);
    if (candidates.some((c) => c === h)) return f.key;
  }
  // looser contains-match (e.g. "company" → companyName)
  for (const f of IMPORT_FIELDS) {
    const candidates = [f.labelEn, f.labelAr].map(norm);
    if (candidates.some((c) => c.includes(h) || h.includes(c))) return f.key;
  }
  return null;
}

// build an initial mapping: sheetHeader → fieldKey (or '' = ignore)
export function autoMap(headers: string[]): Record<string, ImportFieldKey | ''> {
  const used = new Set<ImportFieldKey>();
  const map: Record<string, ImportFieldKey | ''> = {};
  for (const h of headers) {
    const guess = guessFieldForHeader(h);
    if (guess && !used.has(guess)) { map[h] = guess; used.add(guess); }
    else map[h] = '';
  }
  return map;
}

// ---- domain matching ----

export function matchDomain(text: string): InvestorDomain {
  const t = norm(text);
  if (!t) return 'other';
  for (const d of INVESTOR_DOMAINS) {
    const cands = [d, DOMAIN_LABELS[d].en, DOMAIN_LABELS[d].ar].map(norm);
    if (cands.some((c) => c === t || c.includes(t) || t.includes(c))) return d;
  }
  return 'other';
}

// ---- build an InvestorFormInput from a mapped row (defaults missing fields) ----

export type RowBuildResult =
  | { ok: true; input: InvestorFormInput }
  | { ok: false; missing: string[] };

export function buildInvestorInput(
  row: Record<string, string>,
  mapping: Record<string, ImportFieldKey | ''>,
): RowBuildResult {
  // collect mapped values by field key
  const v: Partial<Record<ImportFieldKey, string>> = {};
  for (const [header, fieldKey] of Object.entries(mapping)) {
    if (!fieldKey) continue;
    const val = (row[header] ?? '').trim();
    if (val) v[fieldKey] = val;
  }

  // required minimum: a company name in EITHER language, a representative
  // name in EITHER language, and an email. Missing-language fields default
  // to empty and get completed later (record is tagged 'upload').
  const missing: string[] = [];
  if (!v.companyName && !v.companyNameAr) missing.push('Company Name (EN or AR)');
  if (!v.representativeName && !v.representativeNameAr) missing.push('Representative Name (EN or AR)');
  if (!v.email) missing.push('Email');
  if (missing.length > 0) return { ok: false, missing };

  const input: InvestorFormInput = {
    companyName: v.companyName ?? '',
    companyNameAr: v.companyNameAr ?? '',
    domainType: v.domainType ? matchDomain(v.domainType) : 'other',
    nationality: v.nationality ?? '',
    country: v.country ?? '',
    city: v.city ?? '',
    website: v.website || undefined,
    crNumber: v.crNumber || undefined,
    portfolioSizeUsd: v.portfolioSizeUsd ? Number(v.portfolioSizeUsd.replace(/[^0-9.]/g, '')) || 0 : 0,
    preferredInvestmentRegion: v.preferredInvestmentRegion || undefined,
    representativeName: v.representativeName ?? '',
    representativeNameAr: v.representativeNameAr ?? '',
    position: v.position ?? '',
    positionAr: v.positionAr ?? '',
    email: (v.email ?? '').toLowerCase(),
    mobileNumber: v.mobileNumber ?? '',
    mobileCountryCode: v.mobileCountryCode ?? '',
    fixedNumber: v.fixedNumber || undefined,
    fixedCountryCode: v.fixedCountryCode || undefined,
  };
  return { ok: true, input };
}

// ---- downloadable template ----

export function downloadImportTemplate() {
  const headers = IMPORT_FIELDS.map((f) => f.labelEn);
  const arRow = IMPORT_FIELDS.map((f) => f.labelAr);
  const ws = XLSX.utils.aoa_to_sheet([headers, arRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Investors');
  XLSX.writeFile(wb, 'investor-import-template.xlsx');
}
