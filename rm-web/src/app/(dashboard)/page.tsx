'use client';

import { useAuth } from '@/providers/auth-provider';

export default function DashboardHomePage() {
  const { user, isInitialized } = useAuth();

  if (!isInitialized) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }
  if (!user) return null;

  return (
    <div className="p-6 lg:p-8">
      <div className="bg-white rounded-lg border p-8">
        <h2 className="text-2xl font-semibold mb-2">Welcome, {user.name}!</h2>
        <p className="text-muted-foreground mb-6">
          Authentication is working. The rest of the app is built module by module from here.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 text-sm">
          <div className="space-y-1">
            <div className="text-muted-foreground">Email</div>
            <div className="font-medium">{user.email}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Role</div>
            <div className="font-medium">{user.role}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Permissions</div>
            <div className="font-medium">{user.permissions.length} granted</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Last login</div>
            <div className="font-medium">
              {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}