'use client';

import { useLanguage } from '@/providers/language-provider';
import { createClient } from '@/lib/supabase/client';
import { Globe, LogOut } from 'lucide-react';
import type { User } from '@/types';

export function PortalShell({ user, children }: { user: User; children: React.ReactNode }) {
  const { language, setLanguage } = useLanguage();
  const ar = language === 'ar';

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-slate-50" dir={ar ? 'rtl' : 'ltr'}>
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-slate-800">RM Platform</span>
            <span className="text-[11px] text-slate-400">{ar ? 'بوابة الأطراف المعنية' : 'Stakeholder Portal'}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLanguage(ar ? 'en' : 'ar')}
              className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800"
            >
              <Globe className="h-4 w-4" />{ar ? 'English' : 'العربية'}
            </button>
            <button onClick={logout} className="flex items-center gap-1 text-sm text-slate-600 hover:text-red-600">
              <LogOut className="h-4 w-4" />{ar ? 'خروج' : 'Logout'}
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}