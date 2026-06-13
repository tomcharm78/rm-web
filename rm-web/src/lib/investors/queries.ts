// Investor queries — the data layer between the UI and Supabase.
//
// All functions here return the canonical `Investor` (camelCase, dates as Date),
// never the raw `InvestorRow`. UI components should ONLY use this module to
// touch investor data — never call supabase.from('investors') directly.
//
// Multi-tenancy: every query relies on RLS to scope by organization_id, so
// we don't pass organization_id explicitly on reads. On writes, we read the
// caller's org via current_user_organization_id() — same source of truth.
//
// Soft delete: deleteInvestor() sets `deleted_at = now()`. Listing queries
// filter `deleted_at is null` automatically via RLS. Use restoreInvestor()
// (super_admin only) to undo.

import { createClient } from '@/lib/supabase/client';
import {
  dbRowToInvestor,
  formInputToDbInsert,
  formInputToDbUpdate,
  type Investor,
  type InvestorRow,
  type InvestorFormInput,
  type InvestorDomain,
} from '@/types/investor';

// =============================================================================
// READ
// =============================================================================

export type InvestorListFilters = {
  search?: string;         // matches company name (EN/AR), rep name, country, email
  domain?: InvestorDomain; // exact match
};

export async function listInvestors(filters: InvestorListFilters = {}): Promise<Investor[]> {
  const supabase = createClient();
  let query = supabase
    .from('investors')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // Domain filter is a clean equality.
  if (filters.domain) {
    query = query.eq('domain_type', filters.domain);
  }

  // Search filter is OR-across-several-columns using Supabase's textual or().
  // We escape commas in the search term to avoid breaking the or() syntax.
  if (filters.search && filters.search.trim()) {
    const term = filters.search.trim().replace(/[,()*]/g, ' ');
    const like = `%${term}%`;
    query = query.or(
      `company_name.ilike.${like},company_name_ar.ilike.${like},representative_name.ilike.${like},representative_name_ar.ilike.${like},country.ilike.${like},email.ilike.${like}`
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error('[listInvestors] error:', error);
    throw new Error(error.message);
  }
  return (data as InvestorRow[]).map(dbRowToInvestor);
}

export async function getInvestor(id: string): Promise<Investor | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('investors')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    console.error('[getInvestor] error:', error);
    throw new Error(error.message);
  }
  if (!data) return null;
  return dbRowToInvestor(data as InvestorRow);
}

// =============================================================================
// WRITE
// =============================================================================

// Returns the freshly inserted investor (with server-assigned id, timestamps).
export async function createInvestor(input: InvestorFormInput, sourceSystem?: string): Promise<Investor> {
  const supabase = createClient();

  // Get the caller's auth + org context — needed for FK + audit columns.
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error('not_authenticated');

  // The user row tells us our organization_id. RLS will also enforce this on insert.
  const { data: appUser, error: userErr } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', authUser.id)
    .single();
  if (userErr || !appUser) throw new Error('user_lookup_failed');

  const insertRow = formInputToDbInsert(input, appUser.organization_id, authUser.id, sourceSystem ?? null);

  const { data, error } = await supabase
    .from('investors')
    .insert(insertRow)
    .select('*')
    .single();

  if (error) {
    console.error('[createInvestor] error:', error);
    throw new Error(error.message);
  }
  return dbRowToInvestor(data as InvestorRow);
}

export async function updateInvestor(id: string, input: InvestorFormInput): Promise<Investor> {
  const supabase = createClient();
  const updateRow = formInputToDbUpdate(input);

  const { data, error } = await supabase
    .from('investors')
    .update(updateRow)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[updateInvestor] error:', error);
    throw new Error(error.message);
  }
  return dbRowToInvestor(data as InvestorRow);
}

// Soft delete — set deleted_at = now(). Row remains in DB; RLS hides it.
export async function deleteInvestor(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('investors')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('[deleteInvestor] error:', error);
    throw new Error(error.message);
  }
}
