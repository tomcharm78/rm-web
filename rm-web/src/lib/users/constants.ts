// Member-management constants: role + permission labels (EN/AR), the default
// permission matrix per role, and the member form-input shape.
// Reuses UserRole / UserPermission from '@/types' — nothing redefined here.

import type { UserRole, UserPermission } from '@/types';

// All 10 granular permissions, in display order for the toggle list.
export const ALL_PERMISSIONS: UserPermission[] = [
  'manage_users',
  'manage_investors',
  'create_sessions',
  'create_tasks',
  'create_challenges',
  'approvals',
  'generate_reports',
  'export_data',
  'export_vacations',
  'ai_insights',
  'send_investor_email',
];

// Roles a regular admin can assign. super_admin can also assign 'super_admin'/'admin'.
// 'investor' is excluded here (self-service portal is parked).
export const ADMIN_ASSIGNABLE_ROLES: UserRole[] = ['rm', 'arm'];
export const SUPER_ADMIN_ASSIGNABLE_ROLES: UserRole[] = ['super_admin', 'admin', 'rm', 'arm'];

export const ROLE_LABELS: Record<UserRole, { en: string; ar: string }> = {
  super_admin: { en: 'Super Admin', ar: 'مشرف عام' },
  admin: { en: 'Admin', ar: 'مدير' },
  rm: { en: 'Relationship Manager', ar: 'مدير علاقات' },
  arm: { en: 'Associate RM', ar: 'مدير علاقات مساعد' },
  investor: { en: 'Investor', ar: 'مستثمر' },
};

export const PERMISSION_LABELS: Record<UserPermission, { en: string; ar: string }> = {
  manage_users: { en: 'Manage users', ar: 'إدارة المستخدمين' },
  manage_investors: { en: 'Manage investors', ar: 'إدارة المستثمرين' },
  create_sessions: { en: 'Create sessions', ar: 'إنشاء الجلسات' },
  create_tasks: { en: 'Create tasks', ar: 'إنشاء المهام' },
  create_challenges: { en: 'Create challenges', ar: 'إنشاء التحديات' },
  approvals: { en: 'Approvals', ar: 'الموافقات' },
  generate_reports: { en: 'Generate reports', ar: 'إنشاء التقارير' },
  export_data: { en: 'Export data', ar: 'تصدير البيانات' },
  export_vacations: { en: 'Export vacations', ar: 'تصدير الإجازات' },
  ai_insights: { en: 'AI insights', ar: 'رؤى الذكاء الاصطناعي' },
  send_investor_email: { en: 'Send investor email', ar: 'إرسال بريد للمستثمرين' },
};

// Defaults applied when a role is picked; each toggle is then individually
// overridable. super_admin is all-on and locked in the UI.
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, UserPermission[]> = {
  super_admin: [...ALL_PERMISSIONS],
  admin: [...ALL_PERMISSIONS],
  rm: ['manage_investors', 'create_sessions', 'create_tasks', 'create_challenges', 'ai_insights'],
  arm: ['create_sessions', 'create_tasks', 'ai_insights'],
  investor: [],
};

// What the add/edit member form collects (maps to the users row + user_domains).
export type MemberFormInput = {
  name: string;
  nameAr: string;
  email: string;
  role: UserRole;
  permissions: UserPermission[];
  adminId: string | null;   // reports-to admin (for rm/arm)
  domainIds: string[];      // user_domains assignments
  avatar: string | null;
  isActive: boolean;
  // Department placement (admins only; rm/arm inherit via DB trigger)
  departmentId?: string | null;
  newDepartmentName?: string;
  newDepartmentNameAr?: string;
};