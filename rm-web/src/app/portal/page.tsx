'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/providers/language-provider';
import { useAuth } from '@/providers/auth-provider';
import { ChevronRight, Clock, AlertTriangle } from 'lucide-react';
import { listMyActiveAccess } from '@/lib/challenges/stakeholder-access';

export default function PortalHomePage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const ar = language === 'ar';
  const router = useRouter();

  const accessQ = useQuery({ queryKey: ['my-active-access'], queryFn: listMyActiveAccess });
  const items = accessQ.data ?? [];

  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">
        {ar ? `مرحبًا${user?.name ? '، ' + user.name : ''}` : `Welcome${user?.name ? ', ' + user.name : ''}`}
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        {ar ? 'التحديات التي لديك صلاحية الوصول إليها.' : 'The challenges you have access to.'}
      </p>

      {accessQ.isLoading && <p className="text-sm text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}

      {!accessQ.isLoading && items.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400">
          <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">{ar ? 'لا توجد تحديات متاحة حاليًا.' : 'No challenges available right now.'}</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((it) => (
          <button
            key={it.challengeId}
            onClick={() => router.push('/portal/challenge/' + it.challengeId)}
            className="w-full bg-white rounded-lg border border-slate-200 p-4 text-start hover:border-indigo-300 hover:shadow-sm transition flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-800 truncate">{ar ? it.titleAr || it.title : it.title}</p>
              <p className="text-xs text-slate-400 mt-1 inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {ar ? `ينتهي الوصول خلال ${it.daysLeft} يومًا` : `Access expires in ${it.daysLeft} days`}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-300 shrink-0 rtl:rotate-180" />
          </button>
        ))}
      </div>
    </div>
  );
}