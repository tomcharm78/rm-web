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
  'manage_surveys',
];
// Roles a regular admin can assign. super_admin can also assign super/admin/pmo/pm.
// A pmo can assign only 'pm'. 'investor' is excluded here (portal parked).
export const ADMIN_ASSIGNABLE_ROLES: UserRole[] = ['rm', 'arm'];
export const SUPER_ADMIN_ASSIGNABLE_ROLES: UserRole[] = ['super_admin', 'admin', 'pmo', 'pm', 'rm', 'arm'];
export const PMO_ASSIGNABLE_ROLES: UserRole[] = ['pm'];
export const ROLE_LABELS: Record<UserRole, { en: string; ar: string }> = {
  super_admin: { en: 'Super Admin', ar: 'مشرف عام' },
  admin: { en: 'Admin', ar: 'مدير' },
  pmo: { en: 'Project Management Officer', ar: 'مسؤول إدارة المشاريع' },
  pm: { en: 'Project Manager', ar: 'مدير مشروع' },
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
  manage_surveys: { en: 'Manage surveys', ar: 'إدارة الاستبيانات' },
};
// Defaults applied when a role is picked; each toggle is then individually
// overridable. super_admin is all-on and locked in the UI.
//
// Governance roles (pmo/pm) are LEAN: they get 'approvals' for READ-ONLY hub
// visibility (RLS blocks them from acting) and 'generate_reports' for oversight,
// plus the operational-creation abilities they use for their own work. pmo also
// gets 'manage_users' (to create PMs) + 'export_data'. Neither gets approval
// AUTHORITY — that's enforced in RLS, not this flag.
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, UserPermission[]> = {
  super_admin: [...ALL_PERMISSIONS],
  admin: [...ALL_PERMISSIONS],
  pmo: ['manage_users', 'generate_reports', 'approvals', 'create_tasks', 'create_challenges', 'create_sessions', 'export_data'],
  pm: ['generate_reports', 'approvals', 'create_tasks', 'create_challenges', 'create_sessions', 'ai_insights'],
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
  adminId: string | null;   // reports-to admin (for rm/arm) or reports-to pmo (for pm)
  domainIds: string[];      // user_domains assignments
  avatar: string | null;
  isActive: boolean;
  // Department placement (admins only; rm/arm inherit via DB trigger)
  departmentId?: string | null;
  newDepartmentName?: string;
  newDepartmentNameAr?: string;
  // Governance: department assignments for a pm (pm_department_assignments rows)
  pmDepartmentIds?: string[];
};
