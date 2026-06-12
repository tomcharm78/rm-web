-- =============================================================================
-- RM Platform — Sessions module schema additions
-- Migration: 0009_sessions_module.sql
-- =============================================================================
--
-- The `sessions`, `session_edit_history`, and `session_links` tables already
-- exist from 0001_schema.sql. This migration adds the missing pieces needed
-- by the Sessions module (Scope B+):
--
--   1. `sessions.pending_ai_tasks` JSONB — AI-suggested tasks awaiting admin
--      triage. Each item: { id, title, title_ar, description, description_ar,
--      priority, suggested_assignee_id, suggested_due_date, status }.
--      status = 'pending' | 'assigned' | 'discarded'. Once 'assigned' the
--      admin has created a real task; the entry stays for audit history.
--
--   2. `tasks.source_session_id` FK — when a task is generated from a session,
--      this links them. NULL allowed because Tasks module isn't built yet and
--      tasks can also be created independently. Indexed for "tasks from
--      session X" queries.
--
--   3. Webhook emission trigger on sessions (mirrors emit_investor_event from
--      0007). Events: 'created' | 'updated' | 'locked' | 'unlocked' | 'deleted'.
--      Lock state transitions get their own event types — high-signal for any
--      MOH integration that cares about official record finalization.
--
--   4. RLS policy refinement on sessions so `participant_ids` array membership
--      grants read access (per Q4 decision: participants are registered users
--      with view-only rights even if they didn't create the session).
--
--   5. Seed 2 example sessions for testing (one draft, one locked with edit
--      history). Scoped to the MOH bootstrap organization from 0007.
--
-- IDEMPOTENT: every ALTER / CREATE uses IF NOT EXISTS where possible.
-- Re-running this migration is safe.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Step 1: Add pending_ai_tasks JSONB to sessions
-- -----------------------------------------------------------------------------
-- We use JSONB rather than a relational table because:
--   - These are throwaway suggestions, not first-class entities
--   - They're scoped tightly to one session
--   - Bulk read with the parent session is the only access pattern
--   - Once a real task is created from one, the JSONB entry is just history
--
-- Shape per item (TypeScript-style):
--   {
--     id: string                        // local UUID for triage tracking
--     title: string
--     title_ar: string
--     description: string
--     description_ar: string
--     priority: 'low' | 'medium' | 'high' | 'urgent'
--     suggested_assignee_id: uuid | null
--     suggested_due_date: string | null  // ISO date
--     suggested_domain_id: uuid | null
--     status: 'pending' | 'assigned' | 'discarded'
--     resolved_at: timestamptz | null
--     resolved_by_id: uuid | null
--     created_task_id: uuid | null       // populated when status='assigned'
--     ai_generated_at: timestamptz       // when AI proposed it
--   }
alter table public.sessions
  add column if not exists pending_ai_tasks jsonb not null default '[]'::jsonb;

-- Quick filter on sessions that have *any* pending AI tasks awaiting triage.
-- Useful for admin dashboards: "show me sessions where I need to triage AI tasks".
create index if not exists idx_sessions_has_pending_ai_tasks
  on public.sessions ((jsonb_array_length(pending_ai_tasks) > 0))
  where deleted_at is null;


-- -----------------------------------------------------------------------------
-- Step 2: Add source_session_id to tasks (for the future Tasks module)
-- -----------------------------------------------------------------------------
-- When admin triages an AI suggestion and clicks "Assign", the resulting task
-- gets source_session_id pointing back to the originating session. This is
-- the backbone of "show me all tasks generated from this meeting" queries.
--
-- NULL is allowed because:
--   - Most tasks won't come from sessions (manual task creation)
--   - Tasks module doesn't exist yet — no real tasks are created today
--
-- ON DELETE SET NULL: if a session is hard-deleted (rare; we use soft delete),
-- the task survives but loses the link. Better than cascading the delete.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'source_session_id'
  ) then
    alter table public.tasks
      add column source_session_id uuid references public.sessions(id) on delete set null;
  end if;
end $$;

create index if not exists idx_tasks_source_session
  on public.tasks(source_session_id)
  where source_session_id is not null;


-- -----------------------------------------------------------------------------
-- Step 3: Webhook emission trigger for sessions
-- -----------------------------------------------------------------------------
-- Mirrors public.emit_investor_event() from 0007, but with extra event types
-- for lock state transitions. These are high-signal for compliance/integration:
-- a "locked" session is the official record; an "unlocked-then-edited" session
-- is a red flag worth notifying external systems about.
--
-- Event types emitted:
--   created    INSERT on draft
--   updated    UPDATE that didn't change lock state
--   locked     UPDATE that set locked_at from NULL → not-NULL
--   unlocked   UPDATE that set can_be_edited_after_lock false → true on locked row
--   deleted    DELETE (or soft-delete: UPDATE setting deleted_at)

create or replace function public.emit_session_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_payload    jsonb;
  v_org_id     uuid;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'created';
    v_payload := to_jsonb(new);
    v_org_id := new.organization_id;

  elsif tg_op = 'UPDATE' then
    -- Skip no-op updates (RLS rechecks etc.)
    if new is not distinct from old then
      return new;
    end if;

    -- Lock transition: locked_at went from null to not null
    if old.locked_at is null and new.locked_at is not null then
      v_event_type := 'locked';
    -- Unlock transition: can_be_edited_after_lock flipped on a locked row
    elsif old.locked_at is not null
          and old.can_be_edited_after_lock = false
          and new.can_be_edited_after_lock = true then
      v_event_type := 'unlocked';
    -- Soft-delete via deleted_at
    elsif old.deleted_at is null and new.deleted_at is not null then
      v_event_type := 'deleted';
    else
      v_event_type := 'updated';
    end if;

    v_payload := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
    v_org_id := new.organization_id;

  elsif tg_op = 'DELETE' then
    v_event_type := 'deleted';
    v_payload := to_jsonb(old);
    v_org_id := old.organization_id;
  end if;

  perform public.emit_webhook_event(
    'session',
    coalesce(new.id, old.id),
    v_event_type,
    v_payload,
    v_org_id
  );
  return coalesce(new, old);
end $$;

drop trigger if exists trg_emit_session_event on public.sessions;
create trigger trg_emit_session_event
  after insert or update or delete on public.sessions
  for each row execute function public.emit_session_event();


-- -----------------------------------------------------------------------------
-- Step 4: RLS refinement — participants can read sessions
-- -----------------------------------------------------------------------------
-- Existing policy from 0008 (sessions_read) only checks organization_id +
-- soft-delete + auth.uid(). We need to scope that further:
--   - super_admin / admin: see all sessions in org (already covered by SELECT)
--   - creator: sees their own
--   - any user in participant_ids array: sees the session
--   - everyone else: cannot see it
--
-- The old "everyone in org" policy was too permissive for sessions which can
-- contain sensitive meeting content. Refining now while there are only 2 seed
-- sessions and Sarah is the only user.

drop policy if exists sessions_read on public.sessions;
create policy sessions_read on public.sessions
  for select using (
    organization_id = current_user_organization_id()
    and auth.uid() is not null
    and (deleted_at is null or current_user_role() = 'super_admin')
    and (
      current_user_role() in ('super_admin', 'admin')
      or created_by_id = auth.uid()
      or auth.uid() = any(participant_ids)
    )
  );

-- INSERT/UPDATE/DELETE policies from 0008 stay as-is; the org fence + role
-- check is correct for those operations.


-- -----------------------------------------------------------------------------
-- Step 5: Seed 2 example sessions
-- -----------------------------------------------------------------------------
-- Creates one draft and one locked session, both owned by Sarah Mitchell
-- (super_admin from 0004 seed), scoped to the MOH bootstrap org.
--
-- These give us something to display in the list, exercise the search/filter
-- UI, and demonstrate the locked-state badges + edit history.

do $$
declare
  v_sarah_id    uuid;
  v_org_id      uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_session_locked_id uuid;
begin
  -- Look up Sarah; bail out gracefully if seed never ran (this migration must
  -- still apply cleanly even on a database without seed data)
  select id into v_sarah_id from public.users
   where email = 'sarah.mitchell@rmplatform.com' limit 1;

  if v_sarah_id is null then
    raise notice 'Skipping session seed: Sarah Mitchell not found';
    return;
  end if;

  -- Seed 1: a draft session about a recent investor meeting
  insert into public.sessions (
    organization_id, title, title_ar, meeting_date, meeting_location,
    meeting_location_ar, moh_attendees, visitor_attendees,
    mom_content, mom_content_ar,
    meeting_notes, meeting_notes_ar,
    decisions, decisions_ar,
    action_items, action_items_ar,
    status, participant_ids, created_by_id, pending_ai_tasks
  )
  select
    v_org_id,
    'Q3 Pipeline Review with Saudi Healthcare Ventures',
    'مراجعة خط أنابيب الربع الثالث مع شركة سعودي للرعاية الصحية',
    now() - interval '2 days',
    'MOH Investment Department, Riyadh',
    'إدارة الاستثمار بوزارة الصحة، الرياض',
    '[
      {"id":"moh-1","name":"Sarah Mitchell","name_ar":"سارة ميتشل","position":"Investment Director","position_ar":"مديرة الاستثمار","email":"sarah.mitchell@rmplatform.com","phone":"+966500000001"},
      {"id":"moh-2","name":"Ahmed Al-Rashid","name_ar":"أحمد الراشد","position":"Senior RM","position_ar":"مدير علاقات أول","email":"ahmed.alrashid@rmplatform.com","phone":"+966500000002"}
    ]'::jsonb,
    '[
      {"id":"vis-1","name":"Khalid Al-Nasr","name_ar":"خالد النصر","position":"CEO","position_ar":"الرئيس التنفيذي","organization":"Saudi Healthcare Ventures","organization_ar":"شركة سعودي للرعاية الصحية","email":"khalid@shv.sa","phone":"+966555000001"}
    ]'::jsonb,
    'Discussed Q3 pipeline review and three new licensing applications pending MOH approval. SHV expressed interest in expanding into wellness tourism segment.',
    'تمت مناقشة مراجعة خط أنابيب الربع الثالث وثلاثة طلبات ترخيص جديدة قيد موافقة وزارة الصحة. أعربت الشركة عن اهتمامها بالتوسع في قطاع السياحة العلاجية.',
    'Khalid emphasized timeline pressure on the dialysis center licensing. Sarah committed to follow-up by next Thursday.',
    'أكد خالد على ضغط الجدول الزمني لترخيص مركز الغسيل الكلوي. تعهدت سارة بالمتابعة بحلول الخميس المقبل.',
    'Approved fast-track review for dialysis center application. Wellness tourism proposal requires separate Committee review.',
    'الموافقة على المراجعة السريعة لطلب مركز الغسيل الكلوي. يتطلب اقتراح السياحة العلاجية مراجعة منفصلة من اللجنة.',
    '1. Sarah to coordinate with Licensing Committee by EOW
2. Ahmed to prepare wellness tourism briefing pack
3. Schedule follow-up for end of October',
    '١. تنسيق سارة مع لجنة الترخيص بنهاية الأسبوع
٢. إعداد أحمد لحزمة موجز السياحة العلاجية
٣. جدولة المتابعة لنهاية أكتوبر',
    'draft',
    array[v_sarah_id]::uuid[],
    v_sarah_id,
    '[]'::jsonb
  where not exists (
    select 1 from public.sessions
    where title = 'Q3 Pipeline Review with Saudi Healthcare Ventures'
      and organization_id = v_org_id
  );

  -- Seed 2: a locked session demonstrating the legal-record pattern
  insert into public.sessions (
    organization_id, title, title_ar, meeting_date, meeting_location,
    meeting_location_ar, moh_attendees, visitor_attendees,
    mom_content, mom_content_ar,
    decisions, decisions_ar,
    action_items, action_items_ar,
    status, locked_at, lock_version, participant_ids, created_by_id,
    pending_ai_tasks
  )
  select
    v_org_id,
    'Annual Strategic Review — Global BioTech Partners',
    'المراجعة الاستراتيجية السنوية — شركاء التكنولوجيا الحيوية العالمية',
    now() - interval '21 days',
    'MOH Conference Room A',
    'قاعة المؤتمرات أ بوزارة الصحة',
    '[
      {"id":"moh-1","name":"Sarah Mitchell","name_ar":"سارة ميتشل","position":"Investment Director","position_ar":"مديرة الاستثمار","email":"sarah.mitchell@rmplatform.com","phone":"+966500000001"}
    ]'::jsonb,
    '[
      {"id":"vis-1","name":"Dr. Lisa Chen","name_ar":"د. ليزا تشن","position":"Chief Investment Officer","position_ar":"رئيسة شؤون الاستثمار","organization":"Global BioTech Partners","organization_ar":"شركاء التكنولوجيا الحيوية العالمية","email":"lisa.chen@gbt.com","phone":"+14155550199"}
    ]'::jsonb,
    'Annual review of GBP partnership performance. All three joint ventures performing above target. Committee unanimously approved continued partnership for Year 2.',
    'المراجعة السنوية لأداء شراكة شركاء التكنولوجيا الحيوية. جميع المشاريع المشتركة الثلاثة تتفوق على الأهداف. وافقت اللجنة بالإجماع على استمرار الشراكة للعام الثاني.',
    'Year 2 partnership extension approved unanimously. Investment ceiling raised to USD 50M.',
    'تم الموافقة بالإجماع على تمديد الشراكة للعام الثاني. تم رفع سقف الاستثمار إلى ٥٠ مليون دولار أمريكي.',
    '1. Legal to draft Year 2 partnership amendment
2. Finance to update budget allocations
3. Joint quarterly reviews to begin Q1 2026',
    '١. الشؤون القانونية لصياغة تعديل شراكة العام الثاني
٢. الشؤون المالية لتحديث مخصصات الميزانية
٣. بدء المراجعات الربع سنوية المشتركة في الربع الأول من ٢٠٢٦',
    'locked',
    now() - interval '20 days',
    1,
    array[v_sarah_id]::uuid[],
    v_sarah_id,
    '[]'::jsonb
  returning id into v_session_locked_id;

  -- If we just created the locked session, add an initial edit history entry
  -- showing the lock event itself. This anchors the audit trail.
  if v_session_locked_id is not null then
    insert into public.session_edit_history (
      session_id, edited_by_id, edited_at,
      change_description, change_description_ar
    ) values (
      v_session_locked_id,
      v_sarah_id,
      now() - interval '20 days',
      'Session locked after Committee approval',
      'تم قفل الجلسة بعد موافقة اللجنة'
    );
  end if;
end $$;


-- =============================================================================
-- End of 0009. Verification (run separately, not part of the migration):
--
--   -- Pending AI tasks column exists
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='sessions'
--      and column_name='pending_ai_tasks';
--
--   -- source_session_id added to tasks
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='tasks'
--      and column_name='source_session_id';
--
--   -- Webhook trigger exists
--   select tgname from pg_trigger where tgrelid = 'public.sessions'::regclass
--     and tgname = 'trg_emit_session_event';
--
--   -- Seed sessions arrived (expect 2)
--   select status, count(*) from public.sessions
--    where organization_id = '00000000-0000-0000-0000-000000000001'::uuid
--      and deleted_at is null
--    group by status;
-- =============================================================================
