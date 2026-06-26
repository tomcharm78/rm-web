import { createClient } from '@/lib/supabase/client';
import type { ModuleKey } from '@/lib/modules/registry';

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

// A premium module is enabled only if it has a row AND enabled=true.
// Core modules (not in the table) are always on — callers only check premium keys.
export function isModuleEnabled(settings: ModuleSettings, key: ModuleKey): boolean {
  return settings[key] === true;
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

// self-contained: who am I, can I manage modules, my org, and the current settings map.
export async function getMyModulesControl(): Promise<{
  canManage: boolean;
  organizationId: string | null;
  settings: ModuleSettings;
}> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return { canManage: false, organizationId: null, settings: {} };

  const { data: u } = await supabase
    .from('users').select('can_manage_modules, organization_id').eq('id', me).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = u as any;
  if (!row?.organization_id) return { canManage: false, organizationId: null, settings: {} };

  const settings = await listModuleSettings(row.organization_id);
  return {
    canManage: !!row.can_manage_modules,
    organizationId: row.organization_id,
    settings,
  };
}
