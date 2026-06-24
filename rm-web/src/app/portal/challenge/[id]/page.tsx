'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/providers/language-provider';
import { ArrowLeft, ShieldOff, Loader2 } from 'lucide-react';
import { getChallenge } from '@/lib/challenges/queries';
import { checkMyAccess } from '@/lib/challenges/stakeholder-access';
import { ChallengeJournal } from '@/components/challenges/challenge-journal';

export default function PortalChallengePage() {
  const params = useParams();
  const id = params.id as string;
  const { language } = useLanguage();
  const ar = language === 'ar';
  const router = useRouter();

  const accessQ = useQuery({ queryKey: ['my-access', id], queryFn: () => checkMyAccess(id) });
  const challengeQ = useQuery({
    queryKey: ['challenge', id],
    queryFn: () => getChallenge(id),
    enabled: accessQ.data === true,
  });

  const checking = accessQ.isLoading;
  const allowed = accessQ.data === true;
  const c = challengeQ.data;

  if (checking) {
    return (
      <div className="max-w-3xl mx-auto p-6 lg:p-8 text-slate-400 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />{ar ? 'جارٍ التحقق…' : 'Checking access…'}
      </div>
    );
  }

  // expired / revoked / closed / never-assigned → access denied
  if (!allowed || (challengeQ.isFetched && !c)) {
    return (
      <div className="max-w-3xl mx-auto p-6 lg:p-8">
        <button onClick={() => router.push('/portal')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />{ar ? 'الرئيسية' : 'Home'}
        </button>
        <div className="bg-white rounded-lg border border-slate-200 p-10 text-center">
          <ShieldOff className="h-8 w-8 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-700 font-medium">
            {ar ? 'انتهت الصلاحية. يرجى طلب رابط جديد من الجهة المصدر.' : 'Access denied. Please request a new link from the source.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-8">
      <button onClick={() => router.push('/portal')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />{ar ? 'الرئيسية' : 'Home'}
      </button>

      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-5">
        <h1 className="text-lg font-semibold text-slate-800">{c ? (ar ? c.titleAr || c.title : c.title) : ''}</h1>
        {c && (c.descriptionAr || c.description) && (
          <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{ar ? c.descriptionAr || c.description : c.description}</p>
        )}
      </div>

      <ChallengeJournal challengeId={id} />
    </div>
  );
}