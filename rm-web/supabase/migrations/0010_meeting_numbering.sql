-- =============================================================================
-- RM Platform — Sessions: meeting numbering (Batch 2.5)
-- Migration: 0010_meeting_numbering.sql
-- =============================================================================
--
-- Adds Main vs Follow-up classification with auto-generated meeting numbers.
--
-- Format:
--   Main meeting:      YYYY/MM/DD/NNNN          e.g. 2026/06/12/0001
--   Follow-up meeting: YYYY/MM/DD/NNNN/NNN      e.g. 2026/06/12/0001/001
--
--   YYYY/MM/DD = date of the MEETING (not creation)
--   NNNN       = next sequence for main meetings on that date in the org
--   NNN        = next sequence for follow-ups under that specific main
--
-- Hierarchy is intentionally flat: a follow-up cannot have follow-ups.
-- Numbers allocated by BEFORE INSERT trigger and never reused (gaps OK).
--
-- Concurrency: assign_meeting_number() uses pg_advisory_xact_lock to
-- serialize concurrent inserts on the same (org, date) or under the same
-- parent. Advisory locks release at end of transaction.
--
-- IDEMPOTENT: re-running is safe.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Step 1: Columns + constraints
-- -----------------------------------------------------------------------------
alter table public.sessions
  add column if not exists meeting_type text not null default 'main'
    check (meeting_type in ('main', 'followup'));

alter table public.sessions
  add column if not exists parent_session_id uuid
    references public.sessions(id) on delete restrict;

alter table public.sessions
  add column if not exists meeting_number text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sessions_parent_consistency'
  ) then
    alter table public.sessions
      add constraint sessions_parent_consistency check (
        (meeting_type = 'main' and parent_session_id is null) or
        (meeting_type = 'followup' and parent_session_id is not null)
      );
  end if;
end $$;

create index if not exists idx_sessions_parent on public.sessions(parent_session_id)
  where parent_session_id is not null;

create index if not exists idx_sessions_number on public.sessions(organization_id, meeting_number)
  where meeting_number is not null;


-- -----------------------------------------------------------------------------
-- Step 2: assign_meeting_number — concurrency-safe via advisory locks
-- -----------------------------------------------------------------------------
-- Note: cannot combine FOR UPDATE with aggregate max(); using pg_advisory_xact_lock
-- keyed on (org, date_prefix) for mains, or on parent_id for follow-ups.

create or replace function public.assign_meeting_number(
  p_meeting_date  timestamptz,
  p_org_id        uuid,
  p_type          text,
  p_parent_id     uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date_prefix text := to_char(p_meeting_date at time zone 'UTC', 'YYYY/MM/DD');
  v_parent_number text;
  v_max_seq int;
  v_next_seq int;
begin
  if p_type = 'main' then
    perform pg_advisory_xact_lock(
      hashtextextended(p_org_id::text || '|' || v_date_prefix, 0)
    );

    select coalesce(max(
      cast(split_part(meeting_number, '/', 4) as int)
    ), 0)
    into v_max_seq
    from public.sessions
    where organization_id = p_org_id
      and meeting_type = 'main'
      and meeting_number is not null
      and meeting_number like v_date_prefix || '/%'
      and array_length(string_to_array(meeting_number, '/'), 1) = 4;

    v_next_seq := v_max_seq + 1;
    return v_date_prefix || '/' || lpad(v_next_seq::text, 4, '0');

  elsif p_type = 'followup' then
    select meeting_number into v_parent_number
    from public.sessions
    where id = p_parent_id;

    if v_parent_number is null then
      raise exception 'Parent session % has no meeting number', p_parent_id;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('parent|' || p_parent_id::text, 0)
    );

    select coalesce(max(
      cast(split_part(meeting_number, '/', 5) as int)
    ), 0)
    into v_max_seq
    from public.sessions
    where parent_session_id = p_parent_id
      and meeting_number is not null
      and meeting_number like v_parent_number || '/%'
      and array_length(string_to_array(meeting_number, '/'), 1) = 5;

    v_next_seq := v_max_seq + 1;
    return v_parent_number || '/' || lpad(v_next_seq::text, 3, '0');

  else
    raise exception 'Invalid meeting_type: %', p_type;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- Step 3: BEFORE INSERT trigger to auto-assign meeting_number
-- -----------------------------------------------------------------------------
create or replace function public.set_meeting_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.meeting_number is null then
    new.meeting_number := public.assign_meeting_number(
      new.meeting_date,
      new.organization_id,
      new.meeting_type,
      new.parent_session_id
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_set_meeting_number on public.sessions;
create trigger trg_set_meeting_number
  before insert on public.sessions
  for each row execute function public.set_meeting_number();


-- -----------------------------------------------------------------------------
-- Step 4: Backfill existing rows in deterministic order
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  v_new_number text;
begin
  for r in
    select id, meeting_date, organization_id, meeting_type, parent_session_id
    from public.sessions
    where meeting_number is null
    order by meeting_date, created_at
  loop
    v_new_number := public.assign_meeting_number(
      r.meeting_date, r.organization_id, r.meeting_type, r.parent_session_id
    );
    update public.sessions
      set meeting_number = v_new_number
      where id = r.id;
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- Step 5: Lock down — NOT NULL + UNIQUE per org
-- -----------------------------------------------------------------------------
alter table public.sessions
  alter column meeting_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_meeting_number_unique_per_org'
  ) then
    alter table public.sessions
      add constraint sessions_meeting_number_unique_per_org
      unique (organization_id, meeting_number);
  end if;
end $$;