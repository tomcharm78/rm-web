// Canonical module registry. ONE source of truth for module keys + labels,
// shared by the entitlements gate and the Sarah toggle panel.
//
// premium=true  → gated by org_module_settings (Sarah toggles; later payment)
// premium=false → core, always on, never gated (listed for completeness)

export type ModuleKey =
  // premium
  | 'vacations' | 'reports' | 'survey' | 'hr_training' | 'community' | 'approvals'
  | 'events' | 'kpis' | 'emails' | 'attachments' | 'exports'
  // core
  | 'investors' | 'tasks' | 'sessions' | 'challenges' | 'users' | 'contacts' | 'dashboard';

export type ModuleDef = {
  key: ModuleKey;
  labelEn: string;
  labelAr: string;
  premium: boolean;
};

export const MODULES: ModuleDef[] = [
  // ---- core (always on) ----
  { key: 'investors',  labelEn: 'Investors',    labelAr: 'المستثمرون',        premium: false },
  { key: 'tasks',      labelEn: 'Tasks',        labelAr: 'المهام',            premium: false },
  { key: 'sessions',   labelEn: 'Sessions',     labelAr: 'الجلسات',          premium: false },
  { key: 'challenges', labelEn: 'Challenges',   labelAr: 'التحديات',         premium: false },
  { key: 'users',      labelEn: 'Users',        labelAr: 'المستخدمون',        premium: false },
  { key: 'contacts',   labelEn: 'Contacts',     labelAr: 'جهات الاتصال',      premium: false },
  { key: 'dashboard',  labelEn: 'Dashboard',    labelAr: 'لوحة المعلومات',    premium: false },

  // ---- premium (gated) ----
  { key: 'emails',      labelEn: 'Investor Email', labelAr: 'بريد المستثمرين',  premium: true },
  { key: 'attachments', labelEn: 'Attachments',    labelAr: 'المرفقات',         premium: true },
  { key: 'exports',     labelEn: 'Exports & Downloads', labelAr: 'التصدير والتنزيل', premium: true },
  { key: 'reports',     labelEn: 'Reports',        labelAr: 'التقارير',         premium: true },
  { key: 'survey',      labelEn: 'Surveys',        labelAr: 'الاستبيانات',      premium: true },
  { key: 'kpis',        labelEn: 'KPIs',           labelAr: 'مؤشرات الأداء',    premium: true },
  { key: 'approvals',   labelEn: 'Approvals',      labelAr: 'الموافقات',        premium: true },
  { key: 'vacations',   labelEn: 'Vacations',      labelAr: 'الإجازات',         premium: true },
  { key: 'hr_training', labelEn: 'HR & Training',  labelAr: 'الموارد والتدريب', premium: true },
  { key: 'community',   labelEn: 'Community',      labelAr: 'المجتمع',          premium: true },
  { key: 'events',      labelEn: 'Events',         labelAr: 'الفعاليات',        premium: true },
];

export const PREMIUM_MODULES = MODULES.filter((m) => m.premium);

export function moduleLabel(key: string, ar: boolean): string {
  const m = MODULES.find((x) => x.key === key);
  return m ? (ar ? m.labelAr : m.labelEn) : key;
}
