// Application-level types. These are what UI code and providers consume.
// DB rows use snake_case (from Postgres); the app uses camelCase (matches Expo source).
// Mappers convert at the data layer boundary.

import type { DbUser, UserRole, UserPermission, DbPasswordResetRequest } from './database';

export type { UserRole, UserPermission };

export type User = {
  id: string;
  name: string;
  nameAr: string;
  email: string;
  role: UserRole;
  avatar: string | null;
  isActive: boolean;
  forcePasswordChange: boolean;
  lastLoginAt: string | null;
  permissions: UserPermission[];
  adminId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PasswordResetRequest = {
  id: string;
  userId: string;
  userEmail: string; // joined client-side from users table
  userName: string;  // joined client-side from users table
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
};

// -----------------------------------------------------------------------------
// Mappers: DB row → App type. The boundary between data layer and UI.
// -----------------------------------------------------------------------------

export function dbUserToUser(row: DbUser): User {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar,
    email: row.email,
    role: row.role,
    avatar: row.avatar,
    isActive: row.is_active,
    forcePasswordChange: row.force_password_change,
    lastLoginAt: row.last_login_at,
    permissions: row.permissions,
    adminId: row.admin_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function dbPasswordResetToApp(
  row: DbPasswordResetRequest & { user?: { email: string; name: string } | null }
): PasswordResetRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user?.email ?? '',
    userName: row.user?.name ?? '',
    status: row.status,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at,
    resolvedById: row.resolved_by_id,
  };
}
