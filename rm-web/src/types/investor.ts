// Investor types. Three shapes, intentionally separate:
//
//   1. InvestorRow      — exactly what Supabase returns (snake_case).
//   2. Investor         — the canonical app-side type (camelCase, dates as Date).
//   3. InvestorPublicDTO — what we expose to external systems (MOH, partners).
//                          A stable contract that can evolve independently
//                          from the DB schema. Today: identical fields,
//                          but separating it now means future schema changes
//                          (renames, removals) don't break MOH's integration.
//
// NOTE: InvestorRow is hand-written here because the central database.ts type
// file in this project predates migrations 0007/0008 and is missing the
// organization_id/external_id/source_system/source_metadata columns. Once
// we regenerate database.ts (via `supabase gen types`), we can replace
// these hand-written types with `Database['public']['Tables']['investors']['Row']`
// and friends. Until then, this file is the source of truth for the
// investors table shape.

// =============================================================================
// 1. Raw DB row — hand-written to match the live schema in
//    rork-relationship-management-system-199 after migrations 0001-0008.
// =============================================================================

export type InvestorRow = {
  id: string;
  organization_id: string;
  // Company
  company_name: string;
  company_name_ar: string;
  domain_type: string;
  nationality: string;
  country: string;
  city: string;
  website: string | null;
  cr_number: string | null;
  portfolio_size_usd: number | null;
  preferred_investment_region: string | null;
  // Representative
  representative_name: string;
  representative_name_ar: string;
  position: string;
  position_ar: string;
  email: string;
  mobile_number: string;
  mobile_country_code: string;
  fixed_number: string | null;
  fixed_country_code: string | null;
  // Audit
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Integration
  external_id: string | null;
  source_system: string | null;
  source_metadata: Record<string, unknown> | null;
};

export type InvestorInsert = {
  id?: string;
  organization_id: string;
  company_name: string;
  company_name_ar: string;
  domain_type: string;
  nationality: string;
  country: string;
  city: string;
  website?: string | null;
  cr_number?: string | null;
  portfolio_size_usd?: number | null;
  preferred_investment_region?: string | null;
  representative_name: string;
  representative_name_ar: string;
  position: string;
  position_ar: string;
  email: string;
  mobile_number: string;
  mobile_country_code: string;
  fixed_number?: string | null;
  fixed_country_code?: string | null;
  created_by_id?: string | null;
  external_id?: string | null;
  source_system?: string | null;
  source_metadata?: Record<string, unknown> | null;
};

export type InvestorUpdate = Partial<InvestorInsert>;

// =============================================================================
// 2. Canonical app type
// =============================================================================

export const INVESTOR_DOMAINS = [
  'pharma',
  'biotech',
  'providers',
  'healthtech',
  'medtech',
  'health_insurance',
  'wellness_tourism',
  'hajj_umrah',
  'other',
] as const;

export type InvestorDomain = (typeof INVESTOR_DOMAINS)[number];

export const DOMAIN_LABELS: Record<InvestorDomain, { en: string; ar: string }> = {
  pharma: { en: 'Pharmaceuticals', ar: 'الأدوية' },
  biotech: { en: 'Biotechnology', ar: 'التكنولوجيا الحيوية' },
  providers: { en: 'Healthcare Providers', ar: 'مقدمو الرعاية الصحية' },
  healthtech: { en: 'Health Technology', ar: 'تقنية الصحة' },
  medtech: { en: 'Medical Devices', ar: 'الأجهزة الطبية' },
  health_insurance: { en: 'Health Insurance', ar: 'التأمين الصحي' },
  wellness_tourism: { en: 'Wellness Tourism', ar: 'السياحة الصحية' },
  hajj_umrah: { en: 'Hajj & Umrah', ar: 'الحج والعمرة' },
  other: { en: 'Other', ar: 'أخرى' },
};

export type Investor = {
  id: string;
  organizationId: string;
  companyName: string;
  companyNameAr: string;
  domainType: InvestorDomain;
  nationality: string;
  country: string;
  city: string;
  website: string | null;
  crNumber: string | null;
  portfolioSizeUsd: number | null;
  preferredInvestmentRegion: string | null;
  representativeName: string;
  representativeNameAr: string;
  position: string;
  positionAr: string;
  email: string;
  mobileNumber: string;
  mobileCountryCode: string;
  fixedNumber: string | null;
  fixedCountryCode: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  externalId: string | null;
  sourceSystem: string | null;
  sourceMetadata: Record<string, unknown> | null;
};

// =============================================================================
// 3. Public DTO (for MOH / partner integrations)
// =============================================================================

export type InvestorPublicDTO = {
  id: string;
  external_id: string | null;
  company: {
    name_en: string;
    name_ar: string;
    domain: InvestorDomain;
    nationality: string;
    country: string;
    city: string;
    website: string | null;
    commercial_registration: string | null;
    portfolio_size_usd: number | null;
    preferred_investment_region: string | null;
  };
  representative: {
    name_en: string;
    name_ar: string;
    position_en: string;
    position_ar: string;
    email: string;
    mobile: { country_code: string; number: string };
    fixed: { country_code: string; number: string } | null;
  };
  created_at: string;
  updated_at: string;
};

// =============================================================================
// Mappers
// =============================================================================

export function dbRowToInvestor(row: InvestorRow): Investor {
  return {
    id: row.id,
    organizationId: row.organization_id,
    companyName: row.company_name,
    companyNameAr: row.company_name_ar,
    domainType: (INVESTOR_DOMAINS.includes(row.domain_type as InvestorDomain)
      ? row.domain_type
      : 'other') as InvestorDomain,
    nationality: row.nationality,
    country: row.country,
    city: row.city,
    website: row.website,
    crNumber: row.cr_number,
    portfolioSizeUsd: row.portfolio_size_usd,
    preferredInvestmentRegion: row.preferred_investment_region,
    representativeName: row.representative_name,
    representativeNameAr: row.representative_name_ar,
    position: row.position,
    positionAr: row.position_ar,
    email: row.email,
    mobileNumber: row.mobile_number,
    mobileCountryCode: row.mobile_country_code,
    fixedNumber: row.fixed_number,
    fixedCountryCode: row.fixed_country_code,
    createdById: row.created_by_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    externalId: row.external_id,
    sourceSystem: row.source_system,
    sourceMetadata: row.source_metadata,
  };
}

export function investorToPublicDTO(inv: Investor): InvestorPublicDTO {
  return {
    id: inv.id,
    external_id: inv.externalId,
    company: {
      name_en: inv.companyName,
      name_ar: inv.companyNameAr,
      domain: inv.domainType,
      nationality: inv.nationality,
      country: inv.country,
      city: inv.city,
      website: inv.website,
      commercial_registration: inv.crNumber,
      portfolio_size_usd: inv.portfolioSizeUsd,
      preferred_investment_region: inv.preferredInvestmentRegion,
    },
    representative: {
      name_en: inv.representativeName,
      name_ar: inv.representativeNameAr,
      position_en: inv.position,
      position_ar: inv.positionAr,
      email: inv.email,
      mobile: { country_code: inv.mobileCountryCode, number: inv.mobileNumber },
      fixed: inv.fixedNumber && inv.fixedCountryCode
        ? { country_code: inv.fixedCountryCode, number: inv.fixedNumber }
        : null,
    },
    created_at: inv.createdAt.toISOString(),
    updated_at: inv.updatedAt.toISOString(),
  };
}

// =============================================================================
// Form input → DB insert/update
// =============================================================================

export type InvestorFormInput = {
  companyName: string;
  companyNameAr: string;
  domainType: InvestorDomain;
  nationality: string;
  country: string;
  city: string;
  website?: string;
  crNumber?: string;
  portfolioSizeUsd?: number;
  preferredInvestmentRegion?: string;
  representativeName: string;
  representativeNameAr: string;
  position: string;
  positionAr: string;
  email: string;
  mobileNumber: string;
  mobileCountryCode: string;
  fixedNumber?: string;
  fixedCountryCode?: string;
};

export function formInputToDbInsert(
  input: InvestorFormInput,
  organizationId: string,
  createdById: string | null,
  sourceSystem: string | null = null
): InvestorInsert {
  return {
    organization_id: organizationId,
    company_name: input.companyName.trim(),
    company_name_ar: input.companyNameAr.trim(),
    domain_type: input.domainType,
    nationality: input.nationality.trim(),
    country: input.country.trim(),
    city: input.city.trim(),
    website: input.website?.trim() || null,
    cr_number: input.crNumber?.trim() || null,
    portfolio_size_usd: input.portfolioSizeUsd ?? 0,
    preferred_investment_region: input.preferredInvestmentRegion?.trim() || null,
    representative_name: input.representativeName.trim(),
    representative_name_ar: input.representativeNameAr.trim(),
    position: input.position.trim(),
    position_ar: input.positionAr.trim(),
    email: input.email.trim().toLowerCase(),
    mobile_number: input.mobileNumber.trim(),
    mobile_country_code: input.mobileCountryCode.trim(),
    fixed_number: input.fixedNumber?.trim() || null,
    fixed_country_code: input.fixedCountryCode?.trim() || null,
    created_by_id: createdById,
    source_system: sourceSystem,
  };
}

export function formInputToDbUpdate(input: InvestorFormInput): InvestorUpdate {
  return {
    company_name: input.companyName.trim(),
    company_name_ar: input.companyNameAr.trim(),
    domain_type: input.domainType,
    nationality: input.nationality.trim(),
    country: input.country.trim(),
    city: input.city.trim(),
    website: input.website?.trim() || null,
    cr_number: input.crNumber?.trim() || null,
    portfolio_size_usd: input.portfolioSizeUsd ?? 0,
    preferred_investment_region: input.preferredInvestmentRegion?.trim() || null,
    representative_name: input.representativeName.trim(),
    representative_name_ar: input.representativeNameAr.trim(),
    position: input.position.trim(),
    position_ar: input.positionAr.trim(),
    email: input.email.trim().toLowerCase(),
    mobile_number: input.mobileNumber.trim(),
    mobile_country_code: input.mobileCountryCode.trim(),
    fixed_number: input.fixedNumber?.trim() || null,
    fixed_country_code: input.fixedCountryCode?.trim() || null,
  };
}
