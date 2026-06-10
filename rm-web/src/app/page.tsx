'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { LogOut, User as UserIcon, Globe } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { user, logout, isInitialized } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) return null;

  async function handleLogout() {
    await logout();
    router.replace('/login?signedOut=1');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t('app.name')}</h1>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} className="gap-2">
              <Globe className="h-4 w-4" />
              {language === 'en' ? 'العربية' : 'English'}
            </Button>
            <div className="flex items-center gap-2 text-sm">
              <UserIcon className="h-4 w-4" />
              <span>{user.name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{user.role}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="bg-white rounded-lg border p-8">
          <h2 className="text-2xl font-semibold mb-2">Welcome, {user.name}!</h2>
          <p className="text-muted-foreground mb-6">
            Authentication is working. The rest of the app is built module by module from here.
          </p>
          <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
            <div className="space-y-1"><div className="text-muted-foreground">Email</div><div className="font-medium">{user.email}</div></div>
            <div className="space-y-1"><div className="text-muted-foreground">Role</div><div className="font-medium">{user.role}</div></div>
            <div className="space-y-1"><div className="text-muted-foreground">Permissions</div><div className="font-medium">{user.permissions.length} granted</div></div>
            <div className="space-y-1"><div className="text-muted-foreground">Last login</div><div className="font-medium">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}</div></div>
          </div>
        </div>
      </main>
    </div>
  );
}