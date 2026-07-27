'use client';
// Settings → Pricing. Platform-owner-only quoting tool.
//
// Type a headcount, get the full marginal breakdown, copy it into a customer
// email. Pure UI over buildQuote() — the same calculator the invoice and the
// future payment webhook use, so a quote can never disagree with the eventual
// bill.
import { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { buildQuote, ANNUAL_MONTHS_CHARGED } from '@/lib/billing/pricing';

const SAR = (n: number) => n.toLocaleString('en-US');

export function PricingSection({ ar }: { ar: boolean }) {
  const [seats, setSeats] = useState(50);
  const [discount, setDiscount] = useState(0);
  const [copied, setCopied] = useState(false);

  const q = useMemo(() => buildQuote(seats, discount), [seats, discount]);

  function quoteText(both: boolean): string {
    const en = [
      `RM Platform — quote for ${q.seats} users (${q.tierLabel})`,
      ``,
      ...q.lines.map((l) =>
        l.isFlat
          ? `  Base (first ${l.seatsInBand} seats): ${SAR(l.amount)} SAR`
          : `  Seats in ${l.band} band (${l.seatsInBand} × ${l.rate}): ${SAR(l.amount)} SAR`
      ),
      ``,
      `  Monthly (list): ${SAR(q.monthlyList)} SAR`,
      ...(q.discountPct > 0
        ? [`  Founding discount (${q.discountPct}%): −${SAR(q.monthlyList - q.monthlyNet)} SAR`,
           `  Monthly (net): ${SAR(q.monthlyNet)} SAR`]
        : []),
      `  Blended rate: ${SAR(q.blendedPerSeat)} SAR/seat`,
      `  Annual (${ANNUAL_MONTHS_CHARGED} months billed, 12 delivered): ${SAR(q.annualNet)} SAR`,
    ].join('\n');

    const arText = [
      `منصة RM — عرض سعر لـ ${q.seats} مستخدم (${q.tierLabelAr})`,
      ``,
      ...q.lines.map((l) =>
        l.isFlat
          ? `  الأساس (أول ${l.seatsInBand} مقعد): ${SAR(l.amount)} ريال`
          : `  مقاعد ضمن فئة ${l.bandAr} (${l.seatsInBand} × ${l.rate}): ${SAR(l.amount)} ريال`
      ),
      ``,
      `  الشهري (القائمة): ${SAR(q.monthlyList)} ريال`,
      ...(q.discountPct > 0
        ? [`  خصم التأسيس (${q.discountPct}%): −${SAR(q.monthlyList - q.monthlyNet)} ريال`,
           `  الشهري (الصافي): ${SAR(q.monthlyNet)} ريال`]
        : []),
      `  المعدل المدمج: ${SAR(q.blendedPerSeat)} ريال/مقعد`,
      `  السنوي (${ANNUAL_MONTHS_CHARGED} أشهر تُحتسب، 12 شهرًا تُقدَّم): ${SAR(q.annualNet)} ريال`,
    ].join('\n');

    if (both) return `${en}\n\n———\n\n${arText}`;
    return ar ? arText : en;
  }

  async function copy(both: boolean) {
    try {
      await navigator.clipboard.writeText(quoteText(both));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  const label = 'block text-xs text-slate-500 mb-1';
  const input = 'w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900';

  return (
    <div className="max-w-2xl">
      <h3 className="text-base font-semibold text-slate-900 mb-1">
        {ar ? 'حاسبة الأسعار' : 'Pricing calculator'}
      </h3>
      <p className="text-sm text-slate-500 mb-5">
        {ar
          ? 'أدخل عدد المستخدمين للحصول على تفصيل العرض. الأسعار تنازلية مع زيادة العدد.'
          : 'Enter a headcount for the full breakdown. The blended rate falls as the count rises.'}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div>
          <label className={label}>{ar ? 'عدد المستخدمين' : 'Number of users'}</label>
          <input
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(Math.max(1, parseInt(e.target.value || '1', 10)))}
            className={input}
          />
        </div>
        <div>
          <label className={label}>{ar ? 'خصم التأسيس (%)' : 'Founding discount (%)'}</label>
          <input
            type="number"
            min={0}
            max={100}
            value={discount}
            onChange={(e) => setDiscount(Math.min(100, Math.max(0, parseInt(e.target.value || '0', 10))))}
            className={input}
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden mb-4">
        <div className="bg-slate-50 px-4 py-2 text-xs text-slate-500 flex items-center justify-between">
          <span>{ar ? q.tierLabelAr : q.tierLabel}</span>
          <span>{ar ? `${q.seats} مستخدم` : `${q.seats} users`}</span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {q.lines.map((l, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-600">
                  {l.isFlat
                    ? (ar ? `الأساس (${l.seatsInBand} مقعد)` : `Base (${l.seatsInBand} seats)`)
                    : (ar
                        ? `${l.bandAr} · ${l.seatsInBand} × ${l.rate}`
                        : `${l.band} · ${l.seatsInBand} × ${l.rate}`)}
                </td>
                <td className="px-4 py-2 text-end text-slate-800">{SAR(l.amount)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-4 py-2 text-slate-600">{ar ? 'الشهري (القائمة)' : 'Monthly (list)'}</td>
              <td className="px-4 py-2 text-end text-slate-800">{SAR(q.monthlyList)}</td>
            </tr>
            {q.discountPct > 0 && (
              <>
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-2 text-emerald-700">
                    {ar ? `خصم التأسيس (${q.discountPct}%)` : `Founding discount (${q.discountPct}%)`}
                  </td>
                  <td className="px-4 py-2 text-end text-emerald-700">
                    −{SAR(q.monthlyList - q.monthlyNet)}
                  </td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{ar ? 'الشهري (الصافي)' : 'Monthly (net)'}</td>
                  <td className="px-4 py-2 text-end font-medium text-slate-900">{SAR(q.monthlyNet)}</td>
                </tr>
              </>
            )}
            <tr className="border-t border-slate-100">
              <td className="px-4 py-2 text-slate-600">{ar ? 'المعدل المدمج' : 'Blended per seat'}</td>
              <td className="px-4 py-2 text-end text-slate-800">{SAR(q.blendedPerSeat)} {ar ? 'ريال' : 'SAR'}</td>
            </tr>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-4 py-2 text-slate-600">
                {ar ? `السنوي (${ANNUAL_MONTHS_CHARGED} أشهر)` : `Annual (${ANNUAL_MONTHS_CHARGED} months billed)`}
              </td>
              <td className="px-4 py-2 text-end font-medium text-slate-900">{SAR(q.annualNet)} {ar ? 'ريال' : 'SAR'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => copy(false)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {ar ? 'نسخ العرض' : 'Copy quote'}
        </button>
        <button
          type="button"
          onClick={() => copy(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Copy className="h-4 w-4" />
          {ar ? 'نسخ باللغتين' : 'Copy (both languages)'}
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-4">
        {ar
          ? 'ملاحظة: الأسعار مبدئية للتسويق ولم تُراجَع بعد مقابل تكلفة الاستضافة داخل المملكة.'
          : 'Note: rates are market-positioned and not yet validated against in-Kingdom hosting cost.'}
      </p>
    </div>
  );
}
