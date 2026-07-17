-- TENANT PROVISIONING.
--
-- provision_deputyship() atomically stands up a new deputyship:
--   1. the organization row
--   2. its first super_admin (the users row — the Auth account is created
--      separately by the API route BEFORE this runs, and its id is passed in)
--   3. all module settings, enabled (everyone starts on the full set until a
--      per-tenant agreement narrows it; premium modules will later be toggled
--      by payment status)
--
-- Runs as SECURITY DEFINER so it bypasses RLS — provisioning is a privileged
-- operation with no logged-in tenant user to satisfy the policies. The API
-- route that calls this is responsible for authorising the caller.
--
-- Idempotency: the org slug is unique and the (org, module_key) pair is unique,
-- so a retry with the same slug fails cleanly rather than duplicating.

CREATE OR REPLACE FUNCTION public.provision_deputyship(
  p_org_name        text,
  p_org_name_ar     text,
  p_slug            text,
  p_admin_id        uuid,      -- the already-created Auth user's id
  p_admin_email     text,
  p_admin_name      text,
  p_admin_name_ar   text
)
RETURNS uuid                   -- the new organization id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_module text;
  v_all_modules text[] := ARRAY[
    -- core
    'investors','tasks','sessions','challenges','users','contacts','dashboard',
    -- premium
    'emails','attachments','exports','reports','survey','kpis','approvals',
    'vacations','hr_training','community','events'
  ];
BEGIN
  -- 1. the organization
  INSERT INTO public.organizations (name, name_ar, slug, org_type, country, is_active)
  VALUES (p_org_name, p_org_name_ar, p_slug, 'government', 'Saudi Arabia', true)
  RETURNING id INTO v_org_id;

  -- 2. the first super_admin (Auth account already exists; we use its id)
  INSERT INTO public.users (
    id, name, name_ar, email, role, organization_id,
    is_active, force_password_change, can_manage_modules
  )
  VALUES (
    p_admin_id, p_admin_name, p_admin_name_ar, p_admin_email, 'super_admin', v_org_id,
    true,   -- active
    true,   -- must set their own password on first sign-in
    true    -- this deputyship controls its own modules
  );

  -- 3. every module, enabled
  FOREACH v_module IN ARRAY v_all_modules LOOP
    INSERT INTO public.org_module_settings (organization_id, module_key, enabled, licensed)
    VALUES (v_org_id, v_module, true, true)
    ON CONFLICT (organization_id, module_key) DO NOTHING;
  END LOOP;

  RETURN v_org_id;
END;
$$;

COMMENT ON FUNCTION public.provision_deputyship IS
  'Atomically create a new deputyship: org + first super_admin + all modules enabled. Called by the /api/provision route after the Auth user is created.';
