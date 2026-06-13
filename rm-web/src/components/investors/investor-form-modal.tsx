'use client';

// InvestorFormModal — single modal for both create and edit.
//
// All ~30 fields from the Rork module:
//   Company:        name EN+AR, domain, nationality, country, city,
//                   website, CR number, portfolio USD, preferred region
//   Representative: name EN+AR, position EN+AR, email,
//                   mobile (country code + number), fixed line (optional)
//
// Validation: client-side only, mirrors what RLS+constraints enforce server-side.
//   Required: company names, domain, country, city, rep names, position EN/AR,
//             email, mobile + country code
//   Optional: website, CR number, portfolio, region, fixed line + code, nationality
//   Email: basic format check
//   Phone numbers: digits and spaces allowed
//
// Scanner integration: shows a "Scan business card" button (mobile only) that
// opens the BusinessCardScanner. When the scanner returns parsed data, we
// prefill the form fields.

import { useState, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, ScanLine, Loader2 } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  DOMAIN_LABELS,
  INVESTOR_DOMAINS,
  type Investor,
  type InvestorFormInput,
  type InvestorDomain,
} from '@/types/investor';
import { createInvestor, updateInvestor } from '@/lib/investors/queries';
import { BusinessCardScanner } from '@/components/investors/business-card-scanner';
import type { BusinessCardData } from '@/app/api/scan-business-card/route';

type Props = {
  mode: 'create' | 'edit';
  investor?: Investor;
  onClose: () => void;
  onSaved: (inv: Investor) => void;
};

// Initial empty form
const EMPTY_FORM: InvestorFormInput = {
  companyName: '',
  companyNameAr: '',
  domainType: 'other',
  nationality: '',
  country: '',
  city: '',
  website: '',
  crNumber: '',
  portfolioSizeUsd: undefined,
  preferredInvestmentRegion: '',
  representativeName: '',
  representativeNameAr: '',
  position: '',
  positionAr: '',
  email: '',
  mobileNumber: '',
  mobileCountryCode: '+966',
  fixedNumber: '',
  fixedCountryCode: '',
};

export function InvestorFormModal({ mode, investor, onClose, onSaved }: Props) {
  const { language, isRTL } = useLanguage();
  const [showScanner, setShowScanner] = useState(false);
  const [cameFromScan, setCameFromScan] = useState(false);

  // Detect mobile (for scanner button visibility)
  const isMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }, []);

  // Prefill from existing investor or empty
  const [form, setForm] = useState<InvestorFormInput>(() => {
    if (mode === 'edit' && investor) {
      return {
        companyName: investor.companyName,
        companyNameAr: investor.companyNameAr,
        domainType: investor.domainType,
        nationality: investor.nationality,
        country: investor.country,
        city: investor.city,
        website: investor.website ?? '',
        crNumber: investor.crNumber ?? '',
        portfolioSizeUsd: investor.portfolioSizeUsd ?? undefined,
        preferredInvestmentRegion: investor.preferredInvestmentRegion ?? '',
        representativeName: investor.representativeName,
        representativeNameAr: investor.representativeNameAr,
        position: investor.position,
        positionAr: investor.positionAr,
        email: investor.email,
        mobileNumber: investor.mobileNumber,
        mobileCountryCode: investor.mobileCountryCode,
        fixedNumber: investor.fixedNumber ?? '',
        fixedCountryCode: investor.fixedCountryCode ?? '',
      };
    }
    return EMPTY_FORM;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function setField<K extends keyof InvestorFormInput>(key: K, value: InvestorFormInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }

  function applyScannerData(d: BusinessCardData) {
    setForm((f) => ({
      ...f,
      companyName: d.companyName ?? f.companyName,
      companyNameAr: d.companyNameAr ?? f.companyNameAr,
      representativeName: d.representativeName ?? f.representativeName,
      representativeNameAr: d.representativeNameAr ?? f.representativeNameAr,
      position: d.position ?? f.position,
      positionAr: d.positionAr ?? f.positionAr,
      email: d.email ?? f.email,
      mobileNumber: d.mobileNumber ?? f.mobileNumber,
      mobileCountryCode: d.mobileCountryCode ?? f.mobileCountryCode,
      fixedNumber: d.fixedNumber ?? f.fixedNumber,
      fixedCountryCode: d.fixedCountryCode ?? f.fixedCountryCode,
      website: d.website ?? f.website,
      country: d.country ?? f.country,
      city: d.city ?? f.city,
      nationality: d.nationality ?? f.nationality,
      crNumber: d.crNumber ?? f.crNumber,
    }));
    setCameFromScan(true);
    setShowScanner(false);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    const required: [keyof InvestorFormInput, string][] = [
      ['companyName', 'errCompanyName'],
      ['companyNameAr', 'errCompanyNameAr'],
      ['domainType', 'errDomain'],
      ['country', 'errCountry'],
      ['city', 'errCity'],
      ['representativeName', 'errRepName'],
      ['representativeNameAr', 'errRepNameAr'],
      ['position', 'errPosition'],
      ['positionAr', 'errPositionAr'],
      ['email', 'errEmail'],
      ['mobileNumber', 'errMobile'],
      ['mobileCountryCode', 'errMobileCode'],
    ];
    required.forEach(([key, msg]) => {
      const v = form[key];
      if (typeof v !== 'string' || v.trim() === '') errs[key as string] = msg;
    });
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'errEmailInvalid';
    }
    if (form.website && form.website.trim() && !/^https?:\/\//.test(form.website.trim())) {
      // Auto-fix: prepend https://
      setForm((f) => ({ ...f, website: 'https://' + (f.website ?? '').trim() }));
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const saveMutation = useMutation({
    mutationFn: async () =>
      mode === 'create'
        ? createInvestor(form, cameFromScan ? 'mobile_scan' : undefined)
        : updateInvestor(investor!.id, form),
    onSuccess: (inv) => onSaved(inv),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cameFromScan && !validate()) return;
    saveMutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-2 sm:p-4 overflow-y-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === 'create'
              ? (language === 'ar' ? 'إضافة مستثمر' : 'Add Investor')
              : (language === 'ar' ? 'تعديل المستثمر' : 'Edit Investor')}
          </h2>
          <div className="flex items-center gap-2">
            {isMobile && mode === 'create' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowScanner(true)}
                className="gap-2"
              >
                <ScanLine className="h-4 w-4" />
                {language === 'ar' ? 'مسح البطاقة' : 'Scan Card'}
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Company section */}
          <Section title={language === 'ar' ? 'بيانات الشركة' : 'Company'}>
            <Grid>
              <Field label={language === 'ar' ? 'اسم الشركة (EN)' : 'Company Name (EN)'} error={errors.companyName} required>
                <Input value={form.companyName} onChange={(e) => setField('companyName', e.target.value)} dir="ltr" />
              </Field>
              <Field label={language === 'ar' ? 'اسم الشركة (AR)' : 'Company Name (AR)'} error={errors.companyNameAr} required>
                <Input value={form.companyNameAr} onChange={(e) => setField('companyNameAr', e.target.value)} dir="rtl" />
              </Field>
              <Field label={language === 'ar' ? 'القطاع' : 'Domain'} error={errors.domainType} required>
                <select
                  value={form.domainType}
                  onChange={(e) => setField('domainType', e.target.value as InvestorDomain)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
                >
                  {INVESTOR_DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {language === 'ar' ? DOMAIN_LABELS[d].ar : DOMAIN_LABELS[d].en}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={language === 'ar' ? 'الجنسية' : 'Nationality'}>
                <Input value={form.nationality} onChange={(e) => setField('nationality', e.target.value)} />
              </Field>
              <Field label={language === 'ar' ? 'الدولة' : 'Country'} error={errors.country} required>
                <Input value={form.country} onChange={(e) => setField('country', e.target.value)} />
              </Field>
              <Field label={language === 'ar' ? 'المدينة' : 'City'} error={errors.city} required>
                <Input value={form.city} onChange={(e) => setField('city', e.target.value)} />
              </Field>
              <Field label={language === 'ar' ? 'الموقع الإلكتروني' : 'Website'}>
                <Input value={form.website ?? ''} onChange={(e) => setField('website', e.target.value)} placeholder="https://..." dir="ltr" />
              </Field>
              <Field label={language === 'ar' ? 'رقم السجل التجاري' : 'CR Number'}>
                <Input value={form.crNumber ?? ''} onChange={(e) => setField('crNumber', e.target.value)} dir="ltr" />
              </Field>
              <Field label={language === 'ar' ? 'حجم المحفظة (USD)' : 'Portfolio Size (USD)'}>
                <Input
                  type="number"
                  value={form.portfolioSizeUsd ?? ''}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    setField('portfolioSizeUsd', isNaN(n) ? undefined : n);
                  }}
                  dir="ltr"
                />
              </Field>
              <Field label={language === 'ar' ? 'منطقة الاستثمار المفضلة' : 'Preferred Investment Region'}>
                <Input
                  value={form.preferredInvestmentRegion ?? ''}
                  onChange={(e) => setField('preferredInvestmentRegion', e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: الخليج، الشرق الأوسط، عالمي' : 'e.g. GCC, MENA, Global'}
                />
              </Field>
            </Grid>
          </Section>

          {/* Representative section */}
          <Section title={language === 'ar' ? 'بيانات الممثل' : 'Representative'}>
            <Grid>
              <Field label={language === 'ar' ? 'الاسم (EN)' : 'Name (EN)'} error={errors.representativeName} required>
                <Input value={form.representativeName} onChange={(e) => setField('representativeName', e.target.value)} dir="ltr" />
              </Field>
              <Field label={language === 'ar' ? 'الاسم (AR)' : 'Name (AR)'} error={errors.representativeNameAr} required>
                <Input value={form.representativeNameAr} onChange={(e) => setField('representativeNameAr', e.target.value)} dir="rtl" />
              </Field>
              <Field label={language === 'ar' ? 'المنصب (EN)' : 'Position (EN)'} error={errors.position} required>
                <Input value={form.position} onChange={(e) => setField('position', e.target.value)} dir="ltr" />
              </Field>
              <Field label={language === 'ar' ? 'المنصب (AR)' : 'Position (AR)'} error={errors.positionAr} required>
                <Input value={form.positionAr} onChange={(e) => setField('positionAr', e.target.value)} dir="rtl" />
              </Field>
              <Field label={language === 'ar' ? 'البريد الإلكتروني' : 'Email'} error={errors.email} required>
                <Input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} dir="ltr" />
              </Field>
              <div /> {/* spacer */}
              <Field label={language === 'ar' ? 'رمز الجوال' : 'Mobile Country Code'} error={errors.mobileCountryCode} required>
                <Input value={form.mobileCountryCode} onChange={(e) => setField('mobileCountryCode', e.target.value)} dir="ltr" placeholder="+966" />
              </Field>
              <Field label={language === 'ar' ? 'رقم الجوال' : 'Mobile Number'} error={errors.mobileNumber} required>
                <Input value={form.mobileNumber} onChange={(e) => setField('mobileNumber', e.target.value)} dir="ltr" placeholder="501234567" />
              </Field>
              <Field label={language === 'ar' ? 'رمز الهاتف الثابت' : 'Fixed Country Code'}>
                <Input value={form.fixedCountryCode ?? ''} onChange={(e) => setField('fixedCountryCode', e.target.value)} dir="ltr" />
              </Field>
              <Field label={language === 'ar' ? 'الهاتف الثابت' : 'Fixed Number'}>
                <Input value={form.fixedNumber ?? ''} onChange={(e) => setField('fixedNumber', e.target.value)} dir="ltr" />
              </Field>
            </Grid>
          </Section>

          {saveMutation.isError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {(saveMutation.error as Error)?.message}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 sticky bottom-0 bg-white">
            <Button type="button" variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {mode === 'create'
                ? (language === 'ar' ? 'إنشاء' : 'Create')
                : (language === 'ar' ? 'حفظ' : 'Save')}
            </Button>
          </div>
        </form>
      </div>

      {/* Scanner overlay */}
      {showScanner && (
        <BusinessCardScanner
          onComplete={applyScannerData}
          onCancel={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label,
  children,
  error,
  required,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-700">
        {label}
        {required && <span className="text-red-500 ms-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
