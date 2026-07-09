'use client';
// Dashboard tile: count of everything currently pending across the approvals hub
// (task closures, transfers, leave, letters). Approvers only. Links to /approvals.
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { getPendingApprovalsCount } from '@/lib/approvals/hub';

export function PendingApprovalsTile() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const router = useRouter();

  const countQ = useQuery({
    queryKey: ['pending-approvals-count'],
    queryFn: getPendingApprovalsCount,
    refetchInterval: 10_000, // keep in step with the hub
  });

  const count = countQ.data ?? 0;
  const Chevron = ar ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={() => router.push('/approvals')}
      className="w-full text-start bg-white rounded-lg border p-5 mb-4 flex items-center justify-between hover:border-indigo-300 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-indigo-50 p-2.5">
          <ClipboardCheck className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">
            {ar ? 'موافقات بانتظار القرار' : 'Pending approvals'}
          </div>
          <div className="text-lg font-semibold">
            {countQ.isLoading ? '—' : count}
            <span className="text-sm font-normal text-muted-foreground ms-1">
              {count === 1 ? (ar ? 'طلب' : 'item') : (ar ? 'طلبات' : 'items')}
            </span>
          </div>
        </div>
      </div>
      <Chevron className="h-5 w-5 text-slate-400" />
    </button>
  );
}
