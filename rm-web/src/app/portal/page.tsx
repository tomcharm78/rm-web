'use client';

import { useLanguage } from '@/providers/language-provider';
import { useAuth } from '@/providers/auth-provider';
import { AlertTriangle } from 'lucide-react';

export default function PortalHomePage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const ar = language === 'ar';

  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">
        {ar ? `مرحبًا${user?.name ? '، ' + user.name : ''}` : `Welcome${user?.name ? ', ' + user.name : ''}`}
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        {ar ? 'التحديات التي لديك صلاحية الوصول إليها.' : 'The challenges you have access to.'}
      </p>

      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400">
        <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-slate-300" />
        <p className="text-sm">{ar ? 'ستظهر تحدياتك هنا.' : 'Your challenges will appear here.'}</p>
      </div>
    </div>
  );
}