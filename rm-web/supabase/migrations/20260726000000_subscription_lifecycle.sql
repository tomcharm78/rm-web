-- Subscription lifecycle state.
--
-- One "access good until" date and a small state machine drive access for every
-- tenant, however that access was granted — online payment, a manual override
-- after a bank transfer, or a free trial all write the same fields.
--
-- Access is resolved from these fields by resolveAccess() (src/lib/billing/
-- subscription.ts), the single source of truth. Nothing gates on plan_status
-- directly — everything asks the resolver, so the rules live in one place.
--
-- Principle carried from the start: a lapse degrades ACCESSORIES (premium modules
-- off, core kept, data retained), never a full lockout — until suspension, which
-- locks access but still RETAINS data, so paying reinstates a tenant intact.

ALTER TABLE public.organizations
  -- trialing | active | grace | suspended. NULL is treated as 'active' for the
  -- existing internal tenant, which has no lifecycle and should never degrade.
  ADD COLUMN IF NOT EXISTS plan_status text,
  -- when the 30-day trial ends
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  -- access is good until this instant; a payment sets it forward, and on a
  -- lapse+repay it resets to now()+1 month (no retro billing — never a ledger)
  ADD COLUMN IF NOT EXISTS paid_through timestamptz,
  -- when the current grace window opened
  ADD COLUMN IF NOT EXISTS grace_started_at timestamptz,
  -- when the ONE-TIME 60-day grace was consumed. NULL = grace still available.
  -- Set once, ever: a later lapse does not reopen grace.
  ADD COLUMN IF NOT EXISTS grace_used_at timestamptz;

COMMENT ON COLUMN public.organizations.plan_status IS
  'trialing | active | grace | suspended. NULL = active with no lifecycle (internal tenant).';
COMMENT ON COLUMN public.organizations.paid_through IS
  'Access good until this instant. Set forward by payment; reset to now()+1mo on lapse+repay. Never a debt ledger — no retro billing.';
COMMENT ON COLUMN public.organizations.grace_used_at IS
  'When the one-time 60-day grace was consumed. NULL = still available. Set once ever; a later lapse does not reopen it.';

-- The existing internal tenant has no lifecycle — pin it active so it can never
-- be caught by degradation logic while grandfathering it in.
UPDATE public.organizations
   SET plan_status = 'active'
 WHERE plan_status IS NULL
   AND id = '00000000-0000-0000-0000-000000000001';
