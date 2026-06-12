-- =============================================================================
-- RM Platform — Sessions module follow-up patches
-- Migration: 0011_sessions_followup_patches.sql
-- =============================================================================
--
-- Patches applied ad-hoc to the live database after 0009 ran, captured here
-- so a fresh rebuild from migrations produces the same end state.
--
-- Two things:
--   1. Loosen the webhook_events.event_type_valid CHECK constraint so the
--      emit_session_event() trigger from 0009 can insert 'locked' and
--      'unlocked' events. Without this, lock attempts fail with:
--        ERROR: new row for relation "webhook_events" violates check
--        constraint "webhook_events_event_type_valid"
--
--   2. Drop 5 pre-multi-tenant policies on public.sessions that were left
--      over from the Rork-era 0002_rls.sql migration. They bypass the
--      organization_id fence added in 0008, creating a multi-tenancy leak.
--      The 4 clean policies created by 0008/0009 cover all needed access.
--
--      Dropped:
--        - sessions_admin       (ALL access by role=admin, no org check)
--        - sessions_super       (ALL access by role=super_admin, no org check)
--        - sessions_insert_self (insert by has_permission, no org check)
--        - sessions_rm_update   (RM/ARM update own, no org check)
--        - sessions_rm_visible  (SELECT with recursive join to tasks/
--                                challenges — caused infinite recursion error)
--
-- IDEMPOTENT: re-running is safe.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Step 1: Update webhook_events constraint
-- -----------------------------------------------------------------------------
-- Drop the old constraint (whatever it allowed) and re-add with the full
-- set of event types now used by sessions and any future webhook emitters.

alter table public.webhook_events
  drop constraint if exists webhook_events_event_type_valid;

alter table public.webhook_events
  add constraint webhook_events_event_type_valid
  check (event_type in ('created', 'updated', 'deleted', 'locked', 'unlocked'));


-- -----------------------------------------------------------------------------
-- Step 2: Drop stale pre-multi-tenant policies on sessions
-- -----------------------------------------------------------------------------
-- After this, sessions has exactly these policies (all from 0008/0009,
-- all org-scoped via current_user_organization_id()):
--   - sessions_read    (SELECT)
--   - sessions_insert  (INSERT)
--   - sessions_update  (UPDATE)
--   - sessions_delete  (DELETE)

drop policy if exists sessions_admin on public.sessions;
drop policy if exists sessions_super on public.sessions;
drop policy if exists sessions_insert_self on public.sessions;
drop policy if exists sessions_rm_update on public.sessions;
drop policy if exists sessions_rm_visible on public.sessions;


-- =============================================================================
-- End of 0011. Verification:
--
--   -- Webhook constraint allows lock events
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'webhook_events_event_type_valid';
--
--   -- Only 4 sessions policies remain
--   select policyname, cmd from pg_policies
--     where schemaname = 'public' and tablename = 'sessions'
--     order by policyname;
-- =============================================================================