-- Per-tenant billing plan and seat cap.
--
-- max_seats NULL means UNLIMITED — tenant #1 and any internal / ministry org
-- are never constrained. A cap only applies to a commercial tenant on a plan.
--
-- The cap is enforced in the /api/users/create route (before the auth account
-- is created, so a refusal needs no rollback). It is NOT a DB constraint,
-- because "active user count" is a moving aggregate rather than a per-row rule,
-- and the count deliberately ignores soft-deleted users — a tenant that churned
-- staff must not hit a phantom limit made of ghosts.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_plan text,
  ADD COLUMN IF NOT EXISTS max_seats integer;

COMMENT ON COLUMN public.organizations.billing_plan IS
  'Tier label for display/reporting (Small Business / Mid-size / Corporate / Enterprise). Price is computed from seat count by the billing calculator, not stored here.';
COMMENT ON COLUMN public.organizations.max_seats IS
  'Hard seat cap. NULL = unlimited (internal/ministry orgs). Enforced in /api/users/create against the count of active, non-deleted users.';
