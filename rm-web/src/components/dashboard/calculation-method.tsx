'use client';
// "How this is calculated" — the arithmetic behind the performance index,
// collapsed by default, opened with a chevron.
//
// Someone told they scored "Low" deserves to see the sum that produced it. An
// evaluation nobody can audit is a complaint waiting to happen, and on a
// government platform that matters more than the tidiness of hiding it.
//
// Every number here comes from the SAME PerfResult the gauges are drawn from —
// nothing is recomputed and nothing is described in prose that could drift out
// of step with the formula. If the scoring changes, this panel changes with it.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PerfResult } from '@/lib/dashboard/scoring';

const TASKS_PER_EQUIVALENT = 12;

export function CalculationMethod({ m, ar }: { m: PerfResult; ar: boolean }) {
  const [open, setOpen] = useState(false);

  const w = m.weights;
  const totalWeight = w.volume + w.timeliness + w.outcomes || 1;

  // Outcomes, shown the way it is actually computed.
  const fromTasks = m.tasksClosed / TASKS_PER_EQUIVALENT;
  const equivalents = m.challengesResolved + fromTasks;

  const onTimePct = m.tasksClosed
    ? Math.round((m.tasksOnTime / m.tasksClosed) * 100)
    : 0;

  // Mirrors computeVolumeScore's monthly bands. Shown so "what do I need to do
  // to move up?" is answered on the same screen as the score, rather than being
  // a number the employee can see but not act on.
  const VOLUME_BANDS: [number, number][] = [[3, 40], [5, 60], [12, 80], [20, 100]];
  const nextBand = VOLUME_BANDS.find(([count]) => m.tasksClosed < count);

  const rowCls = 'flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0';
  const labelCls = 'text-xs text-slate-500';
  const valueCls = 'text-xs text-slate-800 text-end';

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
      >
        <ChevronDown
          className={'h-3.5 w-3.5 transition-transform ' + (open ? 'rotate-180' : '')}
          aria-hidden="true"
        />
        {ar ? 'كيف تُحتسب هذه النتيجة' : 'How this is calculated'}
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">

          {/* Volume */}
          <div className="mb-3">
            <div className="text-xs font-medium text-slate-700 mb-1">
              {ar ? 'الحجم' : 'Volume'}
              <span className="text-slate-400 font-normal">
                {ar ? ' · ما أنجزته' : ' · how much you handled'}
              </span>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>{ar ? 'مهام منجزة' : 'Tasks closed'}</span>
              <span className={valueCls}>{m.tasksClosed}</span>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>{ar ? 'الدرجة' : 'Score'}</span>
              <span className={valueCls}>{m.volumeScore} / 100</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              {ar
                ? 'النطاقات الشهرية: ٣ مهام = ٤٠، ٥ = ٦٠، ١٢ = ٨٠، ٢٠ فأكثر = ١٠٠.'
                : 'Monthly bands: 3 closed = 40, 5 = 60, 12 = 80, 20 or more = 100.'}
              {nextBand && (
                <>
                  {' '}
                  {ar
                    ? `إغلاق ${nextBand[0] - m.tasksClosed} مهمة إضافية يرفع الحجم إلى ${nextBand[1]}.`
                    : `Closing ${nextBand[0] - m.tasksClosed} more would take Volume to ${nextBand[1]}.`}
                </>
              )}
            </p>
          </div>

          {/* Timeliness */}
          <div className="mb-3">
            <div className="text-xs font-medium text-slate-700 mb-1">
              {ar ? 'الالتزام بالوقت' : 'Timeliness'}
              <span className="text-slate-400 font-normal">
                {ar ? ' · الإنجاز في موعده' : ' · on-time & speed'}
              </span>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>{ar ? 'في الوقت المحدد' : 'Closed on time'}</span>
              <span className={valueCls}>
                {m.tasksOnTime} / {m.tasksClosed} ({onTimePct}%)
              </span>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>{ar ? 'متوسط مدة الإغلاق' : 'Average days to close'}</span>
              <span className={valueCls}>
                {m.avgClosureDays} {ar ? 'يوم' : 'days'}
              </span>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>{ar ? 'الدرجة' : 'Score'}</span>
              <span className={valueCls}>{m.timelinessScore} / 100</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              {ar
                ? 'نسبة الإنجاز في الوقت تُمثّل ٦٥٪ من الدرجة، والسرعة ٣٥٪. السرعة: صفر يوم = ١٠٠، و١٤ يومًا فأكثر = ٤٠ (لا تنزل عن ذلك).'
                : 'On-time rate is 65% of this score, closure speed the other 35%. Speed: same-day = 100, 14 days or more = 40 (it never falls below that).'}
            </p>
          </div>

          {/* Outcomes */}
          <div className="mb-3">
            <div className="text-xs font-medium text-slate-700 mb-1">
              {ar ? 'النتائج' : 'Outcomes'}
              <span className="text-slate-400 font-normal">
                {ar ? ' · التحديات والأثر' : ' · challenges & impact'}
              </span>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>{ar ? 'تحديات مُغلقة' : 'Challenges resolved'}</span>
              <span className={valueCls}>{m.challengesResolved}</span>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>
                {ar
                  ? `مهام منجزة ÷ ${TASKS_PER_EQUIVALENT}`
                  : `Tasks closed ÷ ${TASKS_PER_EQUIVALENT}`}
              </span>
              <span className={valueCls}>
                {m.tasksClosed} ÷ {TASKS_PER_EQUIVALENT} = {fromTasks.toFixed(2)}
              </span>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>{ar ? 'المجموع المكافئ' : 'Challenge-equivalents'}</span>
              <span className={valueCls}>{equivalents.toFixed(2)}</span>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>{ar ? 'الدرجة' : 'Score'}</span>
              <span className={valueCls}>{m.outcomesScore} / 100</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              {ar
                ? `يُحتسب المكافئ الواحد بـ ${TASKS_PER_EQUIVALENT} مهمة أو تحدٍّ واحد. المقياس: 0 مكافئ = 0، مكافئ واحد = 60، ثلاثة فأكثر = 100. تُحتسب المهام دائمًا، سواء وُجدت تحديات أم لا.`
                : `One equivalent = ${TASKS_PER_EQUIVALENT} closed tasks, or 1 resolved challenge. The scale: 0 equivalents → 0, 1 → 60, 3 or more → 100. Tasks always count, whether or not you resolved challenges.`}
            </p>
          </div>

          {/* Composite */}
          <div className="pt-2 border-t border-slate-200">
            <div className="text-xs font-medium text-slate-700 mb-1">
              {ar ? 'النتيجة النهائية' : 'Final score'}
            </div>
            <div className={rowCls}>
              <span className={labelCls}>{ar ? 'الحجم' : 'Volume'}</span>
              <span className={valueCls}>
                {m.volumeScore} × {w.volume}%
              </span>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>{ar ? 'الالتزام بالوقت' : 'Timeliness'}</span>
              <span className={valueCls}>
                {m.timelinessScore} × {w.timeliness}%
              </span>
            </div>
            <div className={rowCls}>
              <span className={labelCls}>{ar ? 'النتائج' : 'Outcomes'}</span>
              <span className={valueCls}>
                {m.outcomesScore} × {w.outcomes}%
              </span>
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-medium text-slate-700">
                {ar ? 'المجموع' : 'Composite'}
              </span>
              <span className="text-sm font-medium text-slate-900">{m.composite} / 100</span>
            </div>
            {totalWeight !== 100 && (
              <p className="text-[11px] text-slate-400 mt-1">
                {ar
                  ? `مجموع الأوزان ${totalWeight}% — تُقسَّم النتيجة عليه.`
                  : `Weights total ${totalWeight}% — the score is divided by that.`}
              </p>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
