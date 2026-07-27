import { createClient } from '@/lib/supabase/client';
import type { ModuleKey } from '@/lib/modules/registry';
import { resolveAccess, allowsPremium, type AccessTier } from '@/lib/billing/subscription';

// Map of module_key → enabled, for an org.
export type ModuleSettings = Record<string, boolean>;

export async function listModuleSettings(organizationId: string): Promise<ModuleSettings> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('org_module_settings')
    .select('module_key, enabled')
    .eq('organization_id', organizationId);
  if (error) throw new Error(error.message);
  const map: ModuleSettings = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) map[r.module_key] = !!r.enabled;
  return map;
}

// A premium module is on only if it has a row AND enabled=true — AND the tenant's
// access tier permits premium. Core modules (not in the table) are always on and
// never passed here, so degradation never touches them. This is the single
// chokepoint that makes "degrade accessories, never the org" true everywhere.
// tier defaults to 'full', so existing callers behave as before until they pass one.
export function isModuleEnabled(
  settings: ModuleSettings,
  key: ModuleKey,
  tier: AccessTier = 'full'
): boolean {
  return settings[key] === true && allowsPremium(tier);
}

// flip a module on/off (RLS restricts this to the capability holder, Sarah)
export async function setModuleEnabled(organizationId: string, key: ModuleKey, enabled: boolean): Promise<void> {
  const supabase = createClient();
  // upsert: row may or may not exist yet
  const { error } = await supabase
    .from('org_module_settings')
    .upsert(
      { organization_id: organizationId, module_key: key, enabled, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id,module_key' }
    );
  if (error) throw new Error(error.message);
}

// self-contained: who am I, can I manage modules, my org, current settings, and
// the tenant's access tier (from the subscription lifecycle).
export async function getMyModulesControl(): Promise<{
  canManage: boolean;
  organizationId: string | null;
  settings: ModuleSettings;
  accessTier: AccessTier;
}> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return { canManage: false, organizationId: null, settings: {}, accessTier: 'full' };

  const { data: u } = await supabase
    .from('users').select('can_manage_modules, organization_id').eq('id', me).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = u as any;
  if (!row?.organization_id) return { canManage: false, organizationId: null, settings: {}, accessTier: 'full' };

  const [settings, org] = await Promise.all([
    listModuleSettings(row.organization_id),
    supabase
      .from('organizations')
      .select('plan_status, trial_ends_at, paid_through, grace_started_at, grace_used_at')
      .eq('id', row.organization_id)
      .single(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = org.data as any;
  const accessTier: AccessTier = o
    ? resolveAccess({
        planStatus: o.plan_status ?? null,
        trialEndsAt: o.trial_ends_at ?? null,
        paidThrough: o.paid_through ?? null,
        graceStartedAt: o.grace_started_at ?? null,
        graceUsedAt: o.grace_used_at ?? null,
      }).tier
    : 'full';

  return {
    canManage: !!row.can_manage_modules,
    organizationId: row.organization_id,
    settings,
    accessTier,
  };
}