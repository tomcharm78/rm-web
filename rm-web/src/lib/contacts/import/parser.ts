// Contacts import parser — mirrors the investors import, with the contact field
// set (people, not companies).
//
// Deliberately permissive: real spreadsheets arrive incomplete, and a
// half-filled record you can finish in the app beats a row you lost. The ONE
// floor is that a row must NAME someone — a row with no name is not a record,
// it is the blank line at the bottom of the sheet.
import * as XLSX from 'xlsx';
import type { ContactCreateInput, ContactType } from '@/types/contact';

export type ContactImportFieldKey =
  | 'name' | 'nameAr' | 'email' | 'organization' | 'role' | 'phone' | 'type';

export type ContactImportFieldDef = {
  key: ContactImportFieldKey;
  labelEn: string;
  labelAr: string;
  required: boolean;   // shown in the mapping UI; the real floor is "has a name"
};

export const CONTACT_IMPORT_FIELDS: ContactImportFieldDef[] = [
  { key: 'name',         labelEn: 'Name (EN)',      labelAr: 'الاسم',             required: false },
  { key: 'nameAr',       labelEn: 'Name (AR)',      labelAr: 'الاسم (عربي)',      required: false },
  { key: 'email',        labelEn: 'Email',          labelAr: 'البريد الإلكتروني', required: false },
  { key: 'phone',        labelEn: 'Phone',          labelAr: 'الهاتف',            required: false },
  { key: 'organization', labelEn: 'Organization',   labelAr: 'الجهة',             required: false },
  { key: 'role',         labelEn: 'Role / Title',   labelAr: 'المنصب',            required: false },
  { key: 'type',         labelEn: 'Type',           labelAr: 'التصنيف',           required: false },
];

// ---- sheet reading ---------------------------------------------------------

export type ParsedContactSheet = {
  headers: string[];
  rows: Record<string, string>[];
};

export async function parseContactFile(file: File): Promise<ParsedContactSheet | null> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const first = wb.SheetNames[0];
  if (!first) return null;
  const sheet = wb.Sheets[first];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (json.length === 0) return null;
  const headers = Object.keys(json[0]);
  const rows = json.map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = String(r[h] ?? '').trim();
    return out;
  });
  return { headers, rows };
}

// ---- header -> field guessing ---------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-()./]+/g, '');

const HEADER_HINTS: Record<ContactImportFieldKey, string[]> = {
  name:         ['name', 'fullname', 'contactname', 'الاسم', 'اسم'],
  nameAr:       ['namear', 'arabicname', 'namearabic', 'الاسمعربي', 'الاسمبالعربي'],
  email:        ['email', 'mail', 'emailaddress', 'البريد', 'الايميل'],
  phone:        ['phone', 'mobile', 'tel', 'telephone', 'contactnumber', 'الهاتف', 'الجوال'],
  organization: ['organization', 'organisation', 'company', 'entity', 'employer', 'الجهة', 'الشركة'],
  role:         ['role', 'title', 'position', 'jobtitle', 'المنصب', 'الوظيفة'],
  type:         ['type', 'category', 'contacttype', 'التصنيف', 'النوع'],
};

export function guessContactFieldForHeader(header: string): ContactImportFieldKey | null {
  const h = norm(header);
  if (!h) return null;
  for (const def of CONTACT_IMPORT_FIELDS) {
    const hints = HEADER_HINTS[def.key];
    if (hints.some((hint) => h === hint || h.includes(hint) || hint.includes(h))) {
      return def.key;
    }
  }
  return null;
}

export function autoMapContacts(headers: string[]): Record<string, ContactImportFieldKey | ''> {
  const used = new Set<ContactImportFieldKey>();
  const map: Record<string, ContactImportFieldKey | ''> = {};
  for (const h of headers) {
    const guess = guessContactFieldForHeader(h);
    if (guess && !used.has(guess)) {
      map[h] = guess;
      used.add(guess);
    } else {
      map[h] = '';
    }
  }
  return map;
}

// ---- free text -> ContactType ---------------------------------------------

const TYPE_HINTS: { type: ContactType; words: string[] }[] = [
  { type: 'internal_moh', words: ['internal', 'moh', 'ministry', 'داخلي', 'الوزارة', 'وزارة الصحة'] },
  { type: 'government',   words: ['government', 'govt', 'public', 'حكومي', 'حكومية'] },
  { type: 'private',      words: ['private', 'commercial', 'خاص', 'قطاعخاص'] },
  { type: 'external',     words: ['external', 'outside', 'خارجي'] },
  { type: 'other',        words: ['other', 'misc', 'أخرى', 'اخرى'] },
];

export function matchContactType(text: string): ContactType {
  const t = norm(text);
  if (!t) return 'external';           // same default as createContact
  for (const { type, words } of TYPE_HINTS) {
    if (words.some((w) => t === norm(w) || t.includes(norm(w)) || norm(w).includes(t))) {
      return type;
    }
  }
  return 'other';
}

// ---- row -> ContactCreateInput --------------------------------------------

export type ContactRowResult =
  | { ok: true; input: ContactCreateInput }
  | { ok: false; missing: string[] };

export function buildContactInput(
  row: Record<string, string>,
  mapping: Record<string, ContactImportFieldKey | ''>
): ContactRowResult {
  const v: Partial<Record<ContactImportFieldKey, string>> = {};
  for (const [header, fieldKey] of Object.entries(mapping)) {
    if (!fieldKey) continue;
    const val = (row[header] ?? '').trim();
    if (val) v[fieldKey] = val;
  }

  // The one floor: the row must name someone, in either language.
  if (!v.name && !v.nameAr) {
    return { ok: false, missing: ['Name'] };
  }

  // NOTE: name_ar / organization / role / phone / type are NOT NULL in the DB,
  // so missing values become empty strings rather than nulls. Only email is
  // nullable. That means "unknown" and "blank" look the same in the data —
  // which is the trade for accepting incomplete sheets.
  const input: ContactCreateInput = {
    name: v.name ?? v.nameAr ?? '',
    nameAr: v.nameAr ?? '',
    email: v.email ?? null,
    organization: v.organization ?? '',
    role: v.role ?? '',
    phone: v.phone ?? '',
    type: v.type ? matchContactType(v.type) : 'external',
  };
  return { ok: true, input };
}

// ---- template download -----------------------------------------------------

export function downloadContactTemplate() {
  const headers = CONTACT_IMPORT_FIELDS.map((f) => f.labelEn);
  const example = [
    'Ahmed Al-Otaibi', 'أحمد العتيبي', 'ahmed@example.com',
    '+966500000000', 'Ministry of Health', 'Director', 'government',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
  XLSX.writeFile(wb, 'contacts-import-template.xlsx');
}
