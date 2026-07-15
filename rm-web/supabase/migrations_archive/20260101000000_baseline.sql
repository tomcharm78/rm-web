


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."approval_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."approval_status" OWNER TO "postgres";


CREATE TYPE "public"."challenge_status" AS ENUM (
    'open',
    'investigating',
    'mitigation_in_progress',
    'resolved',
    'closed'
);


ALTER TYPE "public"."challenge_status" OWNER TO "postgres";


CREATE TYPE "public"."challenge_type" AS ENUM (
    'financial',
    'technical',
    'operational',
    'insurance',
    'regulatory',
    'hr_training',
    'others'
);


ALTER TYPE "public"."challenge_type" OWNER TO "postgres";


CREATE TYPE "public"."context_type" AS ENUM (
    'task',
    'challenge',
    'session'
);


ALTER TYPE "public"."context_type" OWNER TO "postgres";


CREATE TYPE "public"."endorsement_status" AS ENUM (
    'requested',
    'accepted',
    'declined',
    'completed'
);


ALTER TYPE "public"."endorsement_status" OWNER TO "postgres";


CREATE TYPE "public"."leave_type" AS ENUM (
    'annual',
    'emergency',
    'maternity',
    'paternity',
    'death',
    'business',
    'sick',
    'hajj',
    'unpaid',
    'other'
);


ALTER TYPE "public"."leave_type" OWNER TO "postgres";


CREATE TYPE "public"."notification_type" AS ENUM (
    'info',
    'warning',
    'error',
    'success'
);


ALTER TYPE "public"."notification_type" OWNER TO "postgres";


CREATE TYPE "public"."pwd_reset_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."pwd_reset_status" OWNER TO "postgres";


CREATE TYPE "public"."session_status" AS ENUM (
    'draft',
    'locked'
);


ALTER TYPE "public"."session_status" OWNER TO "postgres";


CREATE TYPE "public"."task_priority" AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


ALTER TYPE "public"."task_priority" OWNER TO "postgres";


CREATE TYPE "public"."task_status" AS ENUM (
    'pending',
    'in_progress',
    'blocked',
    'done',
    'cancelled'
);


ALTER TYPE "public"."task_status" OWNER TO "postgres";


CREATE TYPE "public"."transfer_status" AS ENUM (
    'requested',
    'approved',
    'rejected',
    'executed'
);


ALTER TYPE "public"."transfer_status" OWNER TO "postgres";


CREATE TYPE "public"."user_permission" AS ENUM (
    'approvals',
    'generate_reports',
    'ai_insights',
    'manage_users',
    'manage_investors',
    'create_tasks',
    'create_challenges',
    'create_sessions',
    'export_data',
    'export_vacations',
    'send_investor_email',
    'manage_surveys',
    'configure_performance'
);


ALTER TYPE "public"."user_permission" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'super_admin',
    'admin',
    'rm',
    'arm',
    'investor',
    'stakeholder'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."vacation_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);


ALTER TYPE "public"."vacation_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_borrow"("p_borrow_id" "uuid", "p_member_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_caller uuid := auth.uid();
  v_request_id uuid;
  v_to_admin uuid;
  v_subtask_id uuid;
begin
  select b.request_id, b.to_admin_id into v_request_id, v_to_admin
  from public.task_force_borrows b where b.id = p_borrow_id;
  if v_request_id is null then
    raise exception 'borrow not found';
  end if;

  -- only the lending admin (or super) may approve
  if v_to_admin <> v_caller and not public.current_user_is_super() then
    raise exception 'not authorized to approve this borrow';
  end if;

  -- the assigned member must be on the lending admin's own team
  if not public.current_user_is_super()
     and not exists (select 1 from public.users u where u.id = p_member_id and u.admin_id = v_caller) then
    raise exception 'assigned member must be on the lending admin team';
  end if;

  -- approve this borrow
  update public.task_force_borrows
    set status = 'approved', assigned_member_id = p_member_id, updated_at = now()
    where id = p_borrow_id;

  -- withdraw any sibling pending borrows on the same request
  update public.task_force_borrows
    set status = 'withdrawn', updated_at = now()
    where request_id = v_request_id and id <> p_borrow_id and status = 'pending';

  -- activate the request + hand the subtask to the borrowed member.
  -- support_status='requested' makes the existing notify_subtask_support trigger
  -- fire and the subtask land in the member's "Subtasks I own" inbox.
  select subtask_id into v_subtask_id from public.task_force_requests where id = v_request_id;
  update public.task_force_requests set status = 'active', updated_at = now() where id = v_request_id;
  update public.milestone_subtasks
    set assigned_to_id = p_member_id, support_status = 'requested',
        support_decline_reason = null, updated_at = now()
    where id = v_subtask_id;
end $$;


ALTER FUNCTION "public"."approve_borrow"("p_borrow_id" "uuid", "p_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_meeting_number"("p_meeting_date" timestamp with time zone, "p_org_id" "uuid", "p_type" "text", "p_parent_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."assign_meeting_number"("p_meeting_date" timestamp with time zone, "p_org_id" "uuid", "p_type" "text", "p_parent_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_actor_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_uid uuid;
begin
  -- 1. Try auth.uid() (set when called via PostgREST/Supabase API)
  begin
    v_uid := auth.uid();
    if v_uid is not null then
      return v_uid;
    end if;
  exception when others then
    -- auth schema may not exist in some contexts; ignore
    null;
  end;

  -- 2. Try app.actor_id session variable (set by edge functions or scripts)
  begin
    v_uid := nullif(current_setting('app.actor_id', true), '')::uuid;
    if v_uid is not null then
      return v_uid;
    end if;
  exception when others then
    null;
  end;

  -- 3. No actor — system-generated change
  return null;
end;
$$;


ALTER FUNCTION "public"."audit_actor_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_approval_semantic"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_actor uuid := audit_actor_id();
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into audit_logs (actor_id, action_type, entity_type, entity_id, before_json, after_json)
    values (
      v_actor,
      case new.status
        when 'approved' then 'APPROVAL_GRANTED'
        when 'rejected' then 'APPROVAL_DENIED'
        when 'executed' then 'APPROVAL_EXECUTED'
        else 'APPROVAL_STATUS_CHANGED' end,
      'approval_requests', new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status, 'decision_reason', new.decision_reason,
                        'request_type', new.request_type)
    );
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."audit_approval_semantic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_challenge_semantic"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_actor uuid := audit_actor_id();
begin
  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      insert into challenge_status_history (challenge_id, from_status, to_status, changed_by_id, reason)
      values (
        new.id, old.status, new.status,
        coalesce(v_actor, new.created_by_id),
        new.resolution_note
      );

      insert into audit_logs (actor_id, action_type, entity_type, entity_id, before_json, after_json)
      values (
        v_actor,
        case new.status
          when 'resolved' then 'CHALLENGE_RESOLVED'
          when 'closed'   then 'CHALLENGE_CLOSED'
          else 'CHALLENGE_STATUS_CHANGED' end,
        'challenges', new.id,
        jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status)
      );
    end if;

    if old.assigned_to_id is distinct from new.assigned_to_id then
      insert into audit_logs (actor_id, action_type, entity_type, entity_id, before_json, after_json)
      values (v_actor, 'CHALLENGE_REASSIGNED', 'challenges', new.id,
              jsonb_build_object('assigned_to_id', old.assigned_to_id),
              jsonb_build_object('assigned_to_id', new.assigned_to_id));
    end if;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."audit_challenge_semantic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_log_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor       uuid;
  v_entity_id   uuid;
  v_before      jsonb;
  v_after       jsonb;
  v_diff_keys   text[];
begin
  v_actor := audit_actor_id();

  if tg_op = 'INSERT' then
    v_entity_id := (to_jsonb(new) ->> 'id')::uuid;
    v_before    := null;
    v_after     := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_entity_id := (to_jsonb(new) ->> 'id')::uuid;
    v_before    := to_jsonb(old);
    v_after     := to_jsonb(new);

    -- Skip no-op updates: if the only changed key is updated_at, don't log.
    -- Our updated_at trigger fires on every UPDATE, so without this we'd get
    -- spurious audit rows for any update that didn't actually change anything.
    select array_agg(key) into v_diff_keys
    from (
      select key from jsonb_each(v_before)
      where v_after -> key is distinct from v_before -> key
    ) diff;

    if v_diff_keys = array['updated_at']::text[] then
      return null;
    end if;
  else  -- DELETE
    v_entity_id := (to_jsonb(old) ->> 'id')::uuid;
    v_before    := to_jsonb(old);
    v_after     := null;
  end if;

  insert into audit_logs (actor_id, action_type, entity_type, entity_id, before_json, after_json)
  values (v_actor, tg_op, tg_table_name, v_entity_id, v_before, v_after);

  return null;  -- AFTER triggers ignore the return value
end;
$$;


ALTER FUNCTION "public"."audit_log_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_session_semantic"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_actor uuid := audit_actor_id();
begin
  if tg_op = 'UPDATE' then
    -- Session locked: status went draft → locked
    if old.status = 'draft' and new.status = 'locked' then
      insert into audit_logs (actor_id, action_type, entity_type, entity_id, after_json)
      values (v_actor, 'SESSION_LOCKED', 'sessions', new.id,
              jsonb_build_object('locked_at', new.locked_at, 'lock_version', new.lock_version));
    end if;

    -- Session edited after lock (only allowed if can_be_edited_after_lock is true)
    if old.status = 'locked' and new.status = 'locked'
       and old.last_edited_at is distinct from new.last_edited_at then
      insert into audit_logs (actor_id, action_type, entity_type, entity_id, after_json)
      values (v_actor, 'SESSION_EDITED_AFTER_LOCK', 'sessions', new.id,
              jsonb_build_object('last_edited_at', new.last_edited_at));
    end if;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."audit_session_semantic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_task_semantic"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_actor uuid := audit_actor_id();
begin
  if tg_op = 'UPDATE' then
    -- Status change: log to both task_status_history (UI shows this) and audit_logs.
    if old.status is distinct from new.status then
      insert into task_status_history (task_id, from_status, to_status, changed_by_id, change_reason)
      values (
        new.id, old.status, new.status,
        coalesce(v_actor, new.created_by_id),  -- fall back to creator if no actor
        case when new.status = 'cancelled' then new.cancel_reason
             when new.status = 'done'      then new.closure_note
             else null end
      );

      insert into audit_logs (actor_id, action_type, entity_type, entity_id, before_json, after_json)
      values (
        v_actor,
        case new.status
          when 'done'        then 'TASK_COMPLETED'
          when 'cancelled'   then 'TASK_CANCELLED'
          when 'blocked'     then 'TASK_BLOCKED'
          when 'in_progress' then 'TASK_STARTED'
          else 'TASK_STATUS_CHANGED' end,
        'tasks', new.id,
        jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status)
      );
    end if;

    -- Reassignment
    if old.assigned_to_id is distinct from new.assigned_to_id then
      insert into audit_logs (actor_id, action_type, entity_type, entity_id, before_json, after_json)
      values (v_actor, 'TASK_REASSIGNED', 'tasks', new.id,
              jsonb_build_object('assigned_to_id', old.assigned_to_id),
              jsonb_build_object('assigned_to_id', new.assigned_to_id));
    end if;

    -- Archival (separate from soft-delete)
    if old.archived_at is null and new.archived_at is not null then
      insert into audit_logs (actor_id, action_type, entity_type, entity_id, after_json)
      values (v_actor, 'TASK_ARCHIVED', 'tasks', new.id, jsonb_build_object('archived_at', new.archived_at));
    end if;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."audit_task_semantic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_user_semantic"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_actor uuid := audit_actor_id();
begin
  if tg_op = 'UPDATE' then
    if old.role is distinct from new.role then
      insert into audit_logs (actor_id, action_type, entity_type, entity_id, before_json, after_json)
      values (v_actor, 'USER_ROLE_CHANGED', 'users', new.id,
              jsonb_build_object('role', old.role),
              jsonb_build_object('role', new.role));
    end if;

    if old.permissions is distinct from new.permissions then
      insert into audit_logs (actor_id, action_type, entity_type, entity_id, before_json, after_json)
      values (v_actor, 'USER_PERMISSIONS_CHANGED', 'users', new.id,
              jsonb_build_object('permissions', old.permissions),
              jsonb_build_object('permissions', new.permissions));
    end if;

    if old.is_active = true and new.is_active = false then
      insert into audit_logs (actor_id, action_type, entity_type, entity_id, after_json)
      values (v_actor, 'USER_DEACTIVATED', 'users', new.id,
              jsonb_build_object('deactivated_at', now()));
    end if;

    if old.is_active = false and new.is_active = true then
      insert into audit_logs (actor_id, action_type, entity_type, entity_id, after_json)
      values (v_actor, 'USER_REACTIVATED', 'users', new.id,
              jsonb_build_object('reactivated_at', now()));
    end if;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."audit_user_semantic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_vacation_semantic"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_actor uuid := audit_actor_id();
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into audit_logs (actor_id, action_type, entity_type, entity_id, before_json, after_json)
    values (
      v_actor,
      case new.status
        when 'approved'  then 'VACATION_APPROVED'
        when 'rejected'  then 'VACATION_REJECTED'
        when 'cancelled' then 'VACATION_CANCELLED'
        else 'VACATION_STATUS_CHANGED' end,
      'vacation_requests', new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status, 'rejection_reason', new.rejection_reason,
                        'leave_type', new.leave_type)
    );
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."audit_vacation_semantic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_write_challenge_journal"("p_challenge_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select exists (select 1 from public.challenges c where c.id = p_challenge_id and (c.created_by_id = auth.uid() or c.assigned_to_id = auth.uid())) or exists (select 1 from public.users u join public.challenges c on c.id = p_challenge_id where u.id = auth.uid() and u.role = 'super_admin' and coalesce(u.is_higher_management, false) = false and u.organization_id = c.organization_id) or public.stakeholder_has_active_access(p_challenge_id); $$;


ALTER FUNCTION "public"."can_write_challenge_journal"("p_challenge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cascade_admin_department"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.role = 'admin' and NEW.department_id is distinct from OLD.department_id then
    update public.users
       set department_id = NEW.department_id, updated_at = now()
     where admin_id = NEW.id and role in ('rm','arm') and deleted_at is null;
  end if;
  return NEW;
end $$;


ALTER FUNCTION "public"."cascade_admin_department"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_admin_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select admin_id from public.users where id = auth.uid() and deleted_at is null
$$;


ALTER FUNCTION "public"."current_user_admin_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_can_manage_attachments"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select exists (select 1 from public.users u where u.id = auth.uid() and u.can_manage_attachments = true); $$;


ALTER FUNCTION "public"."current_user_can_manage_attachments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_can_manage_modules"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select exists (select 1 from public.users u where u.id = auth.uid() and u.can_manage_modules = true); $$;


ALTER FUNCTION "public"."current_user_can_manage_modules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_department_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select department_id from public.users where id = auth.uid();
$$;


ALTER FUNCTION "public"."current_user_department_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_domain_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when (select role from public.users where id = auth.uid()) = 'super_admin'
      then (select id from public.domains where deleted_at is null)
    else (select domain_id from public.user_domains where user_id = auth.uid())
  end
$$;


ALTER FUNCTION "public"."current_user_domain_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_is_manager"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('admin','super_admin')
  );
$$;


ALTER FUNCTION "public"."current_user_is_manager"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_is_stakeholder"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'stakeholder'
  );
$$;


ALTER FUNCTION "public"."current_user_is_stakeholder"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_is_super"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'super_admin');
$$;


ALTER FUNCTION "public"."current_user_is_super"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "org_type" "text" DEFAULT 'government'::"text" NOT NULL,
    "country" "text" DEFAULT 'Saudi Arabia'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "attachments_enabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "organizations_org_type_valid" CHECK (("org_type" = ANY (ARRAY['government'::"text", 'private'::"text", 'partner'::"text", 'other'::"text"]))),
    CONSTRAINT "organizations_slug_format" CHECK (("slug" ~ '^[a-z0-9-]+$'::"text"))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_organization"() RETURNS "public"."organizations"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select o.*
    from public.organizations o
    join public.users u on u.organization_id = o.id
   where u.id = auth.uid()
     and u.deleted_at is null
     and o.deleted_at is null
   limit 1
$$;


ALTER FUNCTION "public"."current_user_organization"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_organization_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select organization_id from public.users where id = auth.uid() and deleted_at is null
$$;


ALTER FUNCTION "public"."current_user_organization_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role from public.users where id = auth.uid() and deleted_at is null
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."emit_investor_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    -- Skip if nothing meaningful changed (we don't want UPDATE storms on RLS rechecks)
    if new is not distinct from old then
      return new;
    end if;
    v_event_type := 'updated';
    v_payload := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
    v_org_id := new.organization_id;
  elsif tg_op = 'DELETE' then
    v_event_type := 'deleted';
    v_payload := to_jsonb(old);
    v_org_id := old.organization_id;
  end if;

  perform emit_webhook_event('investor', coalesce(new.id, old.id), v_event_type, v_payload, v_org_id);
  return coalesce(new, old);
end $$;


ALTER FUNCTION "public"."emit_investor_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."emit_session_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."emit_session_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."emit_webhook_event"("p_entity_type" "text", "p_entity_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_org_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
begin
  -- Use explicit org if provided; else look it up via auth context.
  v_org := coalesce(p_org_id, current_user_organization_id());
  if v_org is null then
    -- No org context — abort silently. Triggers must always supply an org.
    return;
  end if;

  insert into public.webhook_events (
    organization_id, entity_type, entity_id, event_type, payload
  ) values (
    v_org, p_entity_type, p_entity_id, p_event_type, p_payload
  );
end $$;


ALTER FUNCTION "public"."emit_webhook_event"("p_entity_type" "text", "p_entity_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("perm" "public"."user_permission") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select role = 'super_admin' or perm = any(permissions)
     from public.users
     where id = auth.uid() and deleted_at is null and is_active = true),
    false
  )
$$;


ALTER FUNCTION "public"."has_permission"("perm" "public"."user_permission") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.users
    where role = 'super_admin'
      and deleted_at is null
  )
$$;


ALTER FUNCTION "public"."has_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_super"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select current_user_role() in ('admin', 'super_admin') $$;


ALTER FUNCTION "public"."is_admin_or_super"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_approval_decision"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ declare v_actor uuid := auth.uid(); begin if NEW.status is distinct from OLD.status and NEW.status = 'approved' then insert into public.notifications (user_id, organization_id, type, read, title, title_ar, message, message_ar, related_entity_type, related_entity_id, source_metadata) values (NEW.requester_id, NEW.organization_id, 'success', false, 'Request approved', 'تمت الموافقة على الطلب', 'Your request was approved. ' || coalesce(NEW.decision_comment,''), 'تمت الموافقة على طلبك. ' || coalesce(NEW.decision_comment,''), 'approval', NEW.id, jsonb_build_object('event','approval_approved','actorId',v_actor)); elsif NEW.status is distinct from OLD.status and NEW.status = 'rejected' then insert into public.notifications (user_id, organization_id, type, read, title, title_ar, message, message_ar, related_entity_type, related_entity_id, source_metadata) values (NEW.requester_id, NEW.organization_id, 'error', false, 'Request rejected', 'تم رفض الطلب', 'Your request was rejected. ' || coalesce(NEW.decision_comment,''), 'تم رفض طلبك. ' || coalesce(NEW.decision_comment,''), 'approval', NEW.id, jsonb_build_object('event','approval_rejected','actorId',v_actor)); end if; return NEW; end; $$;


ALTER FUNCTION "public"."notify_approval_decision"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_approval_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ begin if NEW.approver_id is not null and NEW.approver_id is distinct from NEW.requester_id then insert into public.notifications (user_id, organization_id, type, read, title, title_ar, message, message_ar, related_entity_type, related_entity_id, source_metadata) values (NEW.approver_id, NEW.organization_id, 'info', false, 'Approval request pending', 'طلب موافقة بانتظار قرارك', 'A request needs your approval.', 'يوجد طلب بحاجة إلى موافقتك.', 'approval', NEW.id, jsonb_build_object('event','approval_requested','actorId',NEW.requester_id)); end if; return NEW; end; $$;


ALTER FUNCTION "public"."notify_approval_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_subtask_support"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_task_id uuid; v_task_title text; v_task_title_ar text;
  v_task_assignee uuid; v_org uuid;
begin
  if NEW.support_status is distinct from OLD.support_status then
    select t.id, t.title, t.title_ar, t.assigned_to_id, t.organization_id
      into v_task_id, v_task_title, v_task_title_ar, v_task_assignee, v_org
    from public.task_milestones m
    join public.tasks t on t.id = m.task_id
    where m.id = NEW.milestone_id;

    if NEW.support_status = 'requested'
       and NEW.assigned_to_id is not null
       and NEW.assigned_to_id is distinct from v_actor then
      insert into public.notifications
        (user_id, organization_id, type, read, title, title_ar, message, message_ar,
         related_entity_type, related_entity_id, source_metadata)
      values (NEW.assigned_to_id, v_org, 'info', false,
        'Support requested', 'طلب دعم',
        'You have been asked to support a subtask on: ' || coalesce(v_task_title,'a task') || ' — ' || coalesce(NEW.title,''),
        'تم طلب دعمك في مهمة فرعية ضمن: ' || coalesce(v_task_title_ar, v_task_title,'مهمة') || ' — ' || coalesce(NEW.title_ar, NEW.title,''),
        'task', v_task_id,
        jsonb_build_object('event','support_requested','subtaskId',NEW.id,'actorId',v_actor));

    elsif NEW.support_status = 'accepted'
       and v_task_assignee is not null
       and v_task_assignee is distinct from v_actor then
      insert into public.notifications
        (user_id, organization_id, type, read, title, title_ar, message, message_ar,
         related_entity_type, related_entity_id, source_metadata)
      values (v_task_assignee, v_org, 'success', false,
        'Support accepted', 'تم قبول الدعم',
        'Your support request was accepted on: ' || coalesce(v_task_title,'a task') || ' — ' || coalesce(NEW.title,''),
        'تم قبول طلب الدعم في: ' || coalesce(v_task_title_ar, v_task_title,'مهمة') || ' — ' || coalesce(NEW.title_ar, NEW.title,''),
        'task', v_task_id,
        jsonb_build_object('event','support_accepted','subtaskId',NEW.id,'actorId',v_actor));

    elsif NEW.support_status = 'declined'
       and v_task_assignee is not null
       and v_task_assignee is distinct from v_actor then
      insert into public.notifications
        (user_id, organization_id, type, read, title, title_ar, message, message_ar,
         related_entity_type, related_entity_id, source_metadata)
      values (v_task_assignee, v_org, 'warning', false,
        'Support declined', 'تم رفض الدعم',
        'Your support request was declined on: ' || coalesce(v_task_title,'a task') ||
          case when NEW.support_decline_reason is not null then ' — ' || NEW.support_decline_reason else '' end,
        'تم رفض طلب الدعم في: ' || coalesce(v_task_title_ar, v_task_title,'مهمة') ||
          case when NEW.support_decline_reason is not null then ' — ' || NEW.support_decline_reason else '' end,
        'task', v_task_id,
        jsonb_build_object('event','support_declined','subtaskId',NEW.id,'actorId',v_actor));
    end if;
  end if;
  return NEW;
end; $$;


ALTER FUNCTION "public"."notify_subtask_support"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_task_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_actor uuid := auth.uid();
begin
  if NEW.assigned_to_id is not null
     and NEW.assigned_to_id is distinct from v_actor
     and (TG_OP = 'INSERT' or NEW.assigned_to_id is distinct from OLD.assigned_to_id) then
    insert into public.notifications
      (user_id, organization_id, type, read, title, title_ar, message, message_ar,
       related_entity_type, related_entity_id, source_metadata)
    values (NEW.assigned_to_id, NEW.organization_id, 'info', false,
      'New task assigned', 'مهمة جديدة',
      'A task was assigned to you: ' || coalesce(NEW.title,''),
      'تم إسناد مهمة إليك: ' || coalesce(NEW.title_ar, NEW.title,''),
      'task', NEW.id,
      jsonb_build_object('event','task_assigned','actorId',v_actor));
  end if;
  return NEW;
end; $$;


ALTER FUNCTION "public"."notify_task_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_task_force_borrow"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_note text;
begin
  select request_note into v_note from public.task_force_requests where id = NEW.request_id;
  insert into public.notifications
    (user_id, organization_id, type, read, title, title_ar, message, message_ar,
     related_entity_type, related_entity_id, source_metadata)
  values (NEW.to_admin_id, NEW.organization_id, 'info', false,
    'Cross-department help requested', 'طلب دعم من إدارة أخرى',
    'Another department requests your team''s help — ' || coalesce(v_note,''),
    'تطلب إدارة أخرى مساعدة فريقك — ' || coalesce(v_note,''),
    'task_force', NEW.request_id,
    jsonb_build_object('event','borrow_requested','borrowId',NEW.id));
  return NEW;
end $$;


ALTER FUNCTION "public"."notify_task_force_borrow"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_task_force_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.managing_admin_id is not null then
    insert into public.notifications
      (user_id, organization_id, type, read, title, title_ar, message, message_ar,
       related_entity_type, related_entity_id, source_metadata)
    values (NEW.managing_admin_id, NEW.organization_id, 'info', false,
      'Task force requested', 'طلب فريق عمل',
      'A task force was requested — ' || coalesce(NEW.request_note,''),
      'تم طلب فريق عمل — ' || coalesce(NEW.request_note,''),
      'task', NEW.task_id,
      jsonb_build_object('event','task_force_requested','requestId',NEW.id,'actorId',NEW.requested_by));
  end if;
  return NEW;
end $$;


ALTER FUNCTION "public"."notify_task_force_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_task_force_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.status = 'rejected' and OLD.status is distinct from 'rejected' then
    insert into public.notifications
      (user_id, organization_id, type, read, title, title_ar, message, message_ar,
       related_entity_type, related_entity_id, source_metadata)
    values (NEW.requested_by, NEW.organization_id, 'warning', false,
      'Task force declined', 'تم رفض فريق العمل',
      'Your task force request was declined' ||
        case when NEW.admin1_rejected_reason is not null then ' — ' || NEW.admin1_rejected_reason else '' end,
      'تم رفض طلب فريق العمل' ||
        case when NEW.admin1_rejected_reason is not null then ' — ' || NEW.admin1_rejected_reason else '' end,
      'task', NEW.task_id,
      jsonb_build_object('event','task_force_rejected','requestId',NEW.id));
  elsif NEW.status = 'active' and OLD.status is distinct from 'active' then
    insert into public.notifications
      (user_id, organization_id, type, read, title, title_ar, message, message_ar,
       related_entity_type, related_entity_id, source_metadata)
    values (NEW.requested_by, NEW.organization_id, 'success', false,
      'Task force active', 'فريق العمل نشط',
      'A member has been assigned to your subtask.',
      'تم تعيين عضو لمهمتك الفرعية.',
      'task', NEW.task_id,
      jsonb_build_object('event','task_force_active','requestId',NEW.id));
  end if;
  return NEW;
end $$;


ALTER FUNCTION "public"."notify_task_force_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_task_lifecycle"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_actor uuid := auth.uid(); v_admin uuid;
begin
  select admin_id into v_admin from public.users where id = NEW.assigned_to_id;

  -- closure submitted -> assignee's admin
  if NEW.closure_requested_at is not null and OLD.closure_requested_at is null
     and v_admin is not null and v_admin is distinct from v_actor then
    insert into public.notifications
      (user_id, organization_id, type, read, title, title_ar, message, message_ar,
       related_entity_type, related_entity_id, source_metadata)
    values (v_admin, NEW.organization_id, 'info', false,
      'Closure submitted', 'طلب إغلاق',
      'A task closure was submitted for your approval: ' || coalesce(NEW.title,''),
      'تم تقديم طلب إغلاق مهمة لموافقتك: ' || coalesce(NEW.title_ar, NEW.title,''),
      'task', NEW.id, jsonb_build_object('event','closure_submitted','actorId',v_actor));
  end if;

  -- closure rejected -> assignee
  if NEW.closure_rejected_at is not null and OLD.closure_rejected_at is null
     and NEW.assigned_to_id is not null and NEW.assigned_to_id is distinct from v_actor then
    insert into public.notifications
      (user_id, organization_id, type, read, title, title_ar, message, message_ar,
       related_entity_type, related_entity_id, source_metadata)
    values (NEW.assigned_to_id, NEW.organization_id, 'warning', false,
      'Closure rejected', 'تم رفض الإغلاق',
      'Your task closure was rejected: ' || coalesce(NEW.title,'') ||
        case when NEW.closure_rejected_reason is not null then ' — ' || NEW.closure_rejected_reason else '' end,
      'تم رفض إغلاق مهمتك: ' || coalesce(NEW.title_ar, NEW.title,'') ||
        case when NEW.closure_rejected_reason is not null then ' — ' || NEW.closure_rejected_reason else '' end,
      'task', NEW.id, jsonb_build_object('event','closure_rejected','actorId',v_actor));
  end if;

  -- closure approved (status -> done) -> assignee
  if NEW.status = 'done' and OLD.status is distinct from 'done'
     and NEW.assigned_to_id is not null and NEW.assigned_to_id is distinct from v_actor then
    insert into public.notifications
      (user_id, organization_id, type, read, title, title_ar, message, message_ar,
       related_entity_type, related_entity_id, source_metadata)
    values (NEW.assigned_to_id, NEW.organization_id, 'success', false,
      'Closure approved', 'تمت الموافقة على الإغلاق',
      'Your task was approved and closed: ' || coalesce(NEW.title,''),
      'تمت الموافقة على مهمتك وإغلاقها: ' || coalesce(NEW.title_ar, NEW.title,''),
      'task', NEW.id, jsonb_build_object('event','closure_approved','actorId',v_actor));
  end if;

  -- task declined -> assignee's admin (fallback creator); needs reassignment
  if NEW.declined_at is not null and OLD.declined_at is null then
    if v_admin is null then v_admin := NEW.created_by_id; end if;
    if v_admin is not null and v_admin is distinct from v_actor then
      insert into public.notifications
        (user_id, organization_id, type, read, title, title_ar, message, message_ar,
         related_entity_type, related_entity_id, source_metadata)
      values (v_admin, NEW.organization_id, 'warning', false,
        'Task declined', 'تم رفض المهمة',
        'A task was declined and needs reassignment: ' || coalesce(NEW.title,'') ||
          case when NEW.decline_reason is not null then ' — ' || NEW.decline_reason else '' end,
        'تم رفض مهمة وتحتاج إعادة إسناد: ' || coalesce(NEW.title_ar, NEW.title,'') ||
          case when NEW.decline_reason is not null then ' — ' || NEW.decline_reason else '' end,
        'task', NEW.id, jsonb_build_object('event','task_declined','actorId',v_actor));
    end if;
  end if;

  return NEW;
end; $$;


ALTER FUNCTION "public"."notify_task_lifecycle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_vacation_decision"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ declare v_actor uuid := auth.uid(); begin if NEW.status is distinct from OLD.status and NEW.status = 'approved' then insert into public.notifications (user_id, organization_id, type, read, title, title_ar, message, message_ar, related_entity_type, related_entity_id, source_metadata) values (NEW.user_id, NEW.organization_id, 'success', false, 'Leave approved', 'تمت الموافقة على الإجازة', 'Your leave request was approved.', 'تمت الموافقة على طلب إجازتك.', 'vacation', NEW.id, jsonb_build_object('event','vacation_approved','actorId',v_actor)); elsif NEW.status is distinct from OLD.status and NEW.status = 'rejected' then insert into public.notifications (user_id, organization_id, type, read, title, title_ar, message, message_ar, related_entity_type, related_entity_id, source_metadata) values (NEW.user_id, NEW.organization_id, 'error', false, 'Leave rejected', 'تم رفض الإجازة', 'Your leave request was rejected: ' || coalesce(NEW.rejection_reason,''), 'تم رفض طلب إجازتك: ' || coalesce(NEW.rejection_reason,''), 'vacation', NEW.id, jsonb_build_object('event','vacation_rejected','actorId',v_actor)); end if; return NEW; end; $$;


ALTER FUNCTION "public"."notify_vacation_decision"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_vacation_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ declare v_mgr uuid; begin select admin_id into v_mgr from public.users where id = NEW.user_id; if v_mgr is not null and v_mgr is distinct from NEW.user_id then insert into public.notifications (user_id, organization_id, type, read, title, title_ar, message, message_ar, related_entity_type, related_entity_id, source_metadata) values (v_mgr, NEW.organization_id, 'info', false, 'Leave request pending', 'طلب إجازة بانتظار الموافقة', 'A leave request needs your approval.', 'يوجد طلب إجازة بحاجة إلى موافقتك.', 'vacation', NEW.id, jsonb_build_object('event','vacation_requested','actorId',NEW.user_id)); end if; return NEW; end; $$;


ALTER FUNCTION "public"."notify_vacation_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_meeting_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."set_meeting_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stakeholder_has_active_access"("p_challenge_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.challenge_stakeholder_access a
    join public.challenges c on c.id = a.challenge_id
    where a.stakeholder_user_id = auth.uid()
      and a.challenge_id = p_challenge_id
      and a.revoked_at is null
      and a.expires_at > now()
      and c.status <> 'closed'
      and c.deleted_at is null
      and c.archived_at is null
  );
$$;


ALTER FUNCTION "public"."stakeholder_has_active_access"("p_challenge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_session_department"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  NEW.department_id := (select u.department_id from public.users u where u.id = NEW.created_by_id);
  return NEW;
end $$;


ALTER FUNCTION "public"."sync_session_department"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_task_department"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  NEW.department_id := (select u.department_id from public.users u where u.id = NEW.assigned_to_id);
  return NEW;
end $$;


ALTER FUNCTION "public"."sync_task_department"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_department"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.role in ('rm','arm') then
    NEW.department_id := (select u.department_id from public.users u where u.id = NEW.admin_id);
  elsif NEW.role = 'super_admin' then
    NEW.department_id := null;
  end if;
  -- role = admin: keep NEW.department_id as provided (super assigns it)
  return NEW;
end $$;


ALTER FUNCTION "public"."sync_user_department"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."task_force_complete_on_subtask_done"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.is_done = true and (OLD.is_done is distinct from true) then
    update public.task_force_requests
      set status = 'completed', updated_at = now()
      where subtask_id = NEW.id and status = 'active';
  end if;
  return NEW;
end $$;


ALTER FUNCTION "public"."task_force_complete_on_subtask_done"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tf_user_in_borrow"("p_request_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.task_force_borrows b
    where b.request_id = p_request_id
      and (b.to_admin_id = auth.uid() or b.assigned_member_id = auth.uid())
  );
$$;


ALTER FUNCTION "public"."tf_user_in_borrow"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tf_user_owns_request"("p_request_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.task_force_requests r
    where r.id = p_request_id
      and (r.managing_admin_id = auth.uid() or r.requested_by = auth.uid())
  );
$$;


ALTER FUNCTION "public"."tf_user_owns_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_owns_subtask_on_task"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.milestone_subtasks ms
    join public.task_milestones m on m.id = ms.milestone_id
    where m.task_id = p_task_id and ms.assigned_to_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."user_owns_subtask_on_task"("p_task_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "title_ar" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "description_ar" "text" DEFAULT ''::"text" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "approver_id" "uuid" NOT NULL,
    "status" "public"."approval_status" DEFAULT 'pending'::"public"."approval_status" NOT NULL,
    "decision_comment" "text",
    "decided_at" timestamp with time zone,
    "decided_by_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."approval_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "purpose" "text" DEFAULT 'record'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" bigint NOT NULL,
    "comment" "text" DEFAULT ''::"text" NOT NULL,
    "classification" "text" DEFAULT 'general'::"text" NOT NULL,
    "uploaded_by_id" "uuid" NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "action_type" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "before_json" "jsonb",
    "after_json" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "challenge_id" "uuid" NOT NULL,
    "department_goal_id" "uuid" NOT NULL,
    "linked_by_id" "uuid",
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."challenge_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_journal" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "challenge_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "author_name" "text" DEFAULT ''::"text" NOT NULL,
    "author_name_ar" "text" DEFAULT ''::"text" NOT NULL,
    "author_department" "text" DEFAULT ''::"text" NOT NULL,
    "author_department_ar" "text" DEFAULT ''::"text" NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edited_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."challenge_journal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_stakeholder_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "challenge_id" "uuid" NOT NULL,
    "stakeholder_user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "created_by_id" "uuid" NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '90 days'::interval) NOT NULL,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."challenge_stakeholder_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_stakeholders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "challenge_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text" DEFAULT ''::"text" NOT NULL,
    "organization_name" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text",
    "type" "text" DEFAULT 'external'::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_by_id" "uuid" NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contact_id" "uuid"
);


ALTER TABLE "public"."challenge_stakeholders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "challenge_id" "uuid" NOT NULL,
    "from_status" "public"."challenge_status" NOT NULL,
    "to_status" "public"."challenge_status" NOT NULL,
    "changed_by_id" "uuid" NOT NULL,
    "reason" "text",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."challenge_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "title_ar" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "description_ar" "text" DEFAULT ''::"text" NOT NULL,
    "status" "public"."challenge_status" DEFAULT 'open'::"public"."challenge_status" NOT NULL,
    "priority" "public"."task_priority" DEFAULT 'medium'::"public"."task_priority" NOT NULL,
    "type" "public"."challenge_type" NOT NULL,
    "domain_id" "uuid" NOT NULL,
    "sub_domain_id" "uuid",
    "assigned_to_id" "uuid",
    "resolution_note" "text",
    "completion_percentage" smallint DEFAULT 0 NOT NULL,
    "created_by_id" "uuid" NOT NULL,
    "closed_by_id" "uuid",
    "closed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "archived_by_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb",
    "investor_id" "uuid",
    CONSTRAINT "challenges_completion_percentage_check" CHECK ((("completion_percentage" >= 0) AND ("completion_percentage" <= 100)))
);


ALTER TABLE "public"."challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text",
    "organization" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "type" "text" DEFAULT 'external'::"text" NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_by_id" "uuid" NOT NULL,
    "edited_by_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."department_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "deputyship_goal_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "title_ar" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "description_ar" "text" DEFAULT ''::"text" NOT NULL,
    "year" integer NOT NULL,
    "q1_target" integer DEFAULT 0 NOT NULL,
    "q2_target" integer DEFAULT 0 NOT NULL,
    "q3_target" integer DEFAULT 0 NOT NULL,
    "q4_target" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_type" "text" DEFAULT 'count'::"text" NOT NULL,
    "unit_label" "text" DEFAULT ''::"text" NOT NULL,
    "current_value" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "department_goals_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"]))),
    CONSTRAINT "department_goals_target_type_check" CHECK (("target_type" = ANY (ARRAY['count'::"text", 'percentage'::"text", 'sar'::"text"])))
);


ALTER TABLE "public"."department_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."domains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb"
);


ALTER TABLE "public"."domains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_template" "text" NOT NULL,
    "body_template" "text" NOT NULL,
    "cc" "text" DEFAULT ''::"text" NOT NULL,
    "reply_to" "text" DEFAULT ''::"text" NOT NULL,
    "attachment_paths" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "recipient_count" integer DEFAULT 0 NOT NULL,
    "success_count" integer DEFAULT 0 NOT NULL,
    "fail_count" integer DEFAULT 0 NOT NULL,
    "sent_by_id" "uuid" NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."endorsement_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "endorsed_user_id" "uuid" NOT NULL,
    "scope" "text" NOT NULL,
    "due_date" timestamp with time zone NOT NULL,
    "status" "public"."endorsement_status" DEFAULT 'requested'::"public"."endorsement_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb"
);


ALTER TABLE "public"."endorsement_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_partners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "outbound_url" "text",
    "outbound_secret" "text",
    "inbound_allow_origins" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."integration_partners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."investors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" NOT NULL,
    "company_name_ar" "text" NOT NULL,
    "domain_type" "text" NOT NULL,
    "nationality" "text" NOT NULL,
    "country" "text" NOT NULL,
    "city" "text" NOT NULL,
    "website" "text",
    "cr_number" "text",
    "portfolio_size_usd" numeric(20,2) NOT NULL,
    "preferred_investment_region" "text",
    "representative_name" "text" NOT NULL,
    "representative_name_ar" "text" NOT NULL,
    "position" "text" NOT NULL,
    "position_ar" "text" NOT NULL,
    "email" "text" NOT NULL,
    "mobile_number" "text" NOT NULL,
    "mobile_country_code" "text" NOT NULL,
    "fixed_number" "text",
    "fixed_country_code" "text",
    "created_by_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb"
);


ALTER TABLE "public"."investors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content" "text" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid",
    "context_type" "public"."context_type" NOT NULL,
    "task_id" "uuid",
    "challenge_id" "uuid",
    "session_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb",
    CONSTRAINT "messages_check" CHECK (((("context_type" = 'task'::"public"."context_type") AND ("task_id" IS NOT NULL) AND ("challenge_id" IS NULL) AND ("session_id" IS NULL)) OR (("context_type" = 'challenge'::"public"."context_type") AND ("challenge_id" IS NOT NULL) AND ("task_id" IS NULL) AND ("session_id" IS NULL)) OR (("context_type" = 'session'::"public"."context_type") AND ("session_id" IS NOT NULL) AND ("task_id" IS NULL) AND ("challenge_id" IS NULL))))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."milestone_subtasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "milestone_id" "uuid" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "title_ar" "text" DEFAULT ''::"text" NOT NULL,
    "is_done" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_to_id" "uuid",
    "support_status" "text",
    "support_decline_reason" "text",
    "due_date" "date",
    CONSTRAINT "milestone_subtasks_support_status_chk" CHECK ((("support_status" IS NULL) OR ("support_status" = ANY (ARRAY['requested'::"text", 'accepted'::"text", 'declined'::"text"]))))
);


ALTER TABLE "public"."milestone_subtasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_performance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "year_month" "text" NOT NULL,
    "department_id" "uuid",
    "tasks_closed" integer DEFAULT 0 NOT NULL,
    "tasks_on_time" integer DEFAULT 0 NOT NULL,
    "challenges_resolved" integer DEFAULT 0 NOT NULL,
    "avg_closure_days" numeric DEFAULT 0 NOT NULL,
    "survey_avg" numeric,
    "volume_score" integer DEFAULT 0 NOT NULL,
    "timeliness_score" integer DEFAULT 0 NOT NULL,
    "outcomes_score" integer DEFAULT 0 NOT NULL,
    "composite_score" integer DEFAULT 0 NOT NULL,
    "tier" "text" DEFAULT 'low'::"text" NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."monthly_performance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "title_ar" "text" NOT NULL,
    "message" "text" NOT NULL,
    "message_ar" "text" NOT NULL,
    "type" "public"."notification_type" DEFAULT 'info'::"public"."notification_type" NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    "related_entity_type" "text",
    "related_entity_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_module_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "module_key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "licensed" boolean,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."org_module_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."password_reset_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_email" "text" NOT NULL,
    "user_name" "text" NOT NULL,
    "status" "public"."pwd_reset_status" DEFAULT 'pending'::"public"."pwd_reset_status" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by_id" "uuid",
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb"
);


ALTER TABLE "public"."password_reset_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performance_weights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "department_id" "uuid",
    "volume_weight" integer DEFAULT 40 NOT NULL,
    "timeliness_weight" integer DEFAULT 30 NOT NULL,
    "outcomes_weight" integer DEFAULT 30 NOT NULL,
    "updated_by_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."performance_weights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sent_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "investor_id" "uuid",
    "recipient_email" "text" NOT NULL,
    "recipient_name" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "error" "text",
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sent_emails" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_edit_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "edited_by_id" "uuid" NOT NULL,
    "edited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "change_description" "text" NOT NULL,
    "change_description_ar" "text" NOT NULL,
    "previous_content" "text",
    "new_content" "text"
);


ALTER TABLE "public"."session_edit_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "link_type" "public"."context_type" NOT NULL,
    "task_id" "uuid",
    "challenge_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb",
    CONSTRAINT "session_links_check" CHECK (((("link_type" = 'task'::"public"."context_type") AND ("task_id" IS NOT NULL) AND ("challenge_id" IS NULL)) OR (("link_type" = 'challenge'::"public"."context_type") AND ("challenge_id" IS NOT NULL) AND ("task_id" IS NULL)) OR (("link_type" = 'session'::"public"."context_type") AND ("task_id" IS NULL) AND ("challenge_id" IS NULL))))
);


ALTER TABLE "public"."session_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "title_ar" "text" NOT NULL,
    "meeting_date" timestamp with time zone NOT NULL,
    "meeting_location" "text",
    "meeting_location_ar" "text",
    "moh_attendees" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "visitor_attendees" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "mom_content" "text" DEFAULT ''::"text" NOT NULL,
    "mom_content_ar" "text" DEFAULT ''::"text" NOT NULL,
    "meeting_notes" "text" DEFAULT ''::"text" NOT NULL,
    "meeting_notes_ar" "text" DEFAULT ''::"text" NOT NULL,
    "decisions" "text" DEFAULT ''::"text" NOT NULL,
    "decisions_ar" "text" DEFAULT ''::"text" NOT NULL,
    "action_items" "text" DEFAULT ''::"text" NOT NULL,
    "action_items_ar" "text" DEFAULT ''::"text" NOT NULL,
    "status" "public"."session_status" DEFAULT 'draft'::"public"."session_status" NOT NULL,
    "generated_tasks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "participant_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[] NOT NULL,
    "created_by_id" "uuid" NOT NULL,
    "locked_at" timestamp with time zone,
    "lock_version" integer DEFAULT 0 NOT NULL,
    "export_version" integer,
    "last_edited_at" timestamp with time zone,
    "last_edited_by_id" "uuid",
    "can_be_edited_after_lock" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb",
    "pending_ai_tasks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "meeting_type" "text" DEFAULT 'main'::"text" NOT NULL,
    "parent_session_id" "uuid",
    "meeting_number" "text" NOT NULL,
    "department_id" "uuid",
    CONSTRAINT "sessions_meeting_type_check" CHECK (("meeting_type" = ANY (ARRAY['main'::"text", 'followup'::"text"]))),
    CONSTRAINT "sessions_parent_consistency" CHECK (((("meeting_type" = 'main'::"text") AND ("parent_session_id" IS NULL)) OR (("meeting_type" = 'followup'::"text") AND ("parent_session_id" IS NOT NULL))))
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategic_goal_parents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deputyship_goal_id" "uuid" NOT NULL,
    "org_goal_id" "uuid" NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."strategic_goal_parents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategic_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "tier" "text" NOT NULL,
    "parent_goal_id" "uuid",
    "title" "text" NOT NULL,
    "title_ar" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "description_ar" "text" DEFAULT ''::"text" NOT NULL,
    "year" integer NOT NULL,
    "q1_target" integer,
    "q2_target" integer,
    "q3_target" integer,
    "q4_target" integer,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "strategic_goals_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"]))),
    CONSTRAINT "strategic_goals_tier_check" CHECK (("tier" = ANY (ARRAY['organization'::"text", 'deputyship'::"text"])))
);


ALTER TABLE "public"."strategic_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sub_domains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "domain_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb"
);


ALTER TABLE "public"."sub_domains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "response_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "answer" "jsonb" DEFAULT '"null"'::"jsonb" NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."survey_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_distributions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "generic_token" "text",
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "created_by_id" "uuid" NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone
);


ALTER TABLE "public"."survey_distributions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "question" "text" DEFAULT ''::"text" NOT NULL,
    "question_ar" "text" DEFAULT ''::"text" NOT NULL,
    "q_type" "text" NOT NULL,
    "options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_required" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."survey_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "distribution_id" "uuid",
    "token_id" "uuid",
    "respondent_user_id" "uuid",
    "respondent_investor_id" "uuid",
    "respondent_name" "text" DEFAULT ''::"text" NOT NULL,
    "respondent_email" "text" DEFAULT ''::"text" NOT NULL,
    "is_anonymous" boolean DEFAULT false NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."survey_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "distribution_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "investor_id" "uuid",
    "user_id" "uuid",
    "used_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."survey_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surveys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "title_ar" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "description_ar" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "is_anonymous" boolean DEFAULT false NOT NULL,
    "collect_respondent_info" boolean DEFAULT false NOT NULL,
    "created_by_id" "uuid" NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone
);


ALTER TABLE "public"."surveys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "challenge_id" "uuid" NOT NULL,
    "linked_by_id" "uuid" NOT NULL,
    "linked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."task_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_force_borrows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "to_admin_id" "uuid" NOT NULL,
    "to_department_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "assigned_member_id" "uuid",
    "rejected_reason" "text",
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_force_borrows_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'withdrawn'::"text"])))
);


ALTER TABLE "public"."task_force_borrows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_force_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "subtask_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "request_note" "text",
    "managing_admin_id" "uuid",
    "admin1_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin1_rejected_reason" "text",
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "task_force_requests_admin1_status_check" CHECK (("admin1_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "task_force_requests_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'sourcing'::"text", 'active'::"text", 'completed'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."task_force_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "department_goal_id" "uuid" NOT NULL,
    "linked_by_id" "uuid",
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."task_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_milestones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "title_ar" "text" DEFAULT ''::"text" NOT NULL,
    "is_done" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_to_id" "uuid",
    "due_date" "date",
    "weight" numeric
);


ALTER TABLE "public"."task_milestones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "from_status" "public"."task_status" NOT NULL,
    "to_status" "public"."task_status" NOT NULL,
    "changed_by_id" "uuid" NOT NULL,
    "change_reason" "text",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."task_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "title_ar" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "description_ar" "text" DEFAULT ''::"text" NOT NULL,
    "status" "public"."task_status" DEFAULT 'pending'::"public"."task_status" NOT NULL,
    "priority" "public"."task_priority" DEFAULT 'medium'::"public"."task_priority" NOT NULL,
    "domain_id" "uuid" NOT NULL,
    "sub_domain_id" "uuid",
    "assigned_to_id" "uuid" NOT NULL,
    "created_by_id" "uuid" NOT NULL,
    "tat_start_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tat_due_date" timestamp with time zone NOT NULL,
    "completion_percentage" smallint DEFAULT 0 NOT NULL,
    "completed_at" timestamp with time zone,
    "closure_note" "text",
    "cancel_reason" "text",
    "cancelled_at" timestamp with time zone,
    "source_session_id" "uuid",
    "archived_at" timestamp with time zone,
    "archived_by_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb",
    "closure_requested_at" timestamp with time zone,
    "closure_requested_by" "uuid",
    "closure_rejected_at" timestamp with time zone,
    "closure_rejected_reason" "text",
    "accepted_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    "decline_reason" "text",
    "declined_by" "uuid",
    "department_id" "uuid",
    "source_challenge_id" "uuid",
    CONSTRAINT "tasks_completion_percentage_check" CHECK ((("completion_percentage" >= 0) AND ("completion_percentage" <= 100)))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transfer_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid",
    "challenge_id" "uuid",
    "requester_id" "uuid" NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "public"."transfer_status" DEFAULT 'requested'::"public"."transfer_status" NOT NULL,
    "approved_by_id" "uuid",
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb",
    CONSTRAINT "transfer_requests_check" CHECK (((("task_id" IS NOT NULL) AND ("challenge_id" IS NULL)) OR (("task_id" IS NULL) AND ("challenge_id" IS NOT NULL))))
);


ALTER TABLE "public"."transfer_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_domains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "domain_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_domains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "avatar" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "force_password_change" boolean DEFAULT false NOT NULL,
    "last_login_at" timestamp with time zone,
    "permissions" "public"."user_permission"[] DEFAULT ARRAY[]::"public"."user_permission"[] NOT NULL,
    "admin_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb",
    "department_id" "uuid",
    "is_higher_management" boolean DEFAULT false NOT NULL,
    "can_manage_attachments" boolean DEFAULT false NOT NULL,
    "can_manage_modules" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vacation_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "leave_type" "public"."leave_type" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "public"."vacation_status" DEFAULT 'pending'::"public"."vacation_status" NOT NULL,
    "approver_id" "uuid",
    "rejection_reason" "text",
    "conflicts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "external_id" "text",
    "source_system" "text",
    "source_metadata" "jsonb",
    "leave_type_other" "text",
    "archived_at" timestamp with time zone,
    CONSTRAINT "vacation_requests_check" CHECK (("end_date" >= "start_date"))
);


ALTER TABLE "public"."vacation_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "last_attempt_at" timestamp with time zone,
    "last_error" "text",
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "webhook_events_event_type_valid" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'updated'::"text", 'deleted'::"text", 'locked'::"text", 'unlocked'::"text"]))),
    CONSTRAINT "webhook_events_status_valid" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'dead'::"text"])))
);


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "webhook_sub_entity_type_valid" CHECK (("entity_type" = ANY (ARRAY['investor'::"text", 'task'::"text", 'challenge'::"text", 'session'::"text", 'user'::"text", 'vacation_request'::"text", 'approval_request'::"text", '*'::"text"]))),
    CONSTRAINT "webhook_sub_event_type_valid" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'updated'::"text", 'deleted'::"text", '*'::"text"])))
);


ALTER TABLE "public"."webhook_subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_goals"
    ADD CONSTRAINT "challenge_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_journal"
    ADD CONSTRAINT "challenge_journal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_stakeholder_access"
    ADD CONSTRAINT "challenge_stakeholder_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_stakeholder_access"
    ADD CONSTRAINT "challenge_stakeholder_access_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."challenge_stakeholders"
    ADD CONSTRAINT "challenge_stakeholders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_status_history"
    ADD CONSTRAINT "challenge_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."department_goals"
    ADD CONSTRAINT "department_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."domains"
    ADD CONSTRAINT "domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."domains"
    ADD CONSTRAINT "domains_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."email_batches"
    ADD CONSTRAINT "email_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."endorsement_requests"
    ADD CONSTRAINT "endorsement_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_partners"
    ADD CONSTRAINT "integration_partners_organization_id_slug_key" UNIQUE ("organization_id", "slug");



ALTER TABLE ONLY "public"."integration_partners"
    ADD CONSTRAINT "integration_partners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."investors"
    ADD CONSTRAINT "investors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."milestone_subtasks"
    ADD CONSTRAINT "milestone_subtasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_performance"
    ADD CONSTRAINT "monthly_performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_module_settings"
    ADD CONSTRAINT "org_module_settings_organization_id_module_key_key" UNIQUE ("organization_id", "module_key");



ALTER TABLE ONLY "public"."org_module_settings"
    ADD CONSTRAINT "org_module_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_external_id_unique" UNIQUE NULLS NOT DISTINCT ("source_system", "external_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."password_reset_requests"
    ADD CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_weights"
    ADD CONSTRAINT "performance_weights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sent_emails"
    ADD CONSTRAINT "sent_emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_edit_history"
    ADD CONSTRAINT "session_edit_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_links"
    ADD CONSTRAINT "session_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_meeting_number_unique_per_org" UNIQUE ("organization_id", "meeting_number");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategic_goal_parents"
    ADD CONSTRAINT "strategic_goal_parents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategic_goals"
    ADD CONSTRAINT "strategic_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sub_domains"
    ADD CONSTRAINT "sub_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sub_domains"
    ADD CONSTRAINT "sub_domains_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."survey_answers"
    ADD CONSTRAINT "survey_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_distributions"
    ADD CONSTRAINT "survey_distributions_generic_token_key" UNIQUE ("generic_token");



ALTER TABLE ONLY "public"."survey_distributions"
    ADD CONSTRAINT "survey_distributions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_questions"
    ADD CONSTRAINT "survey_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_tokens"
    ADD CONSTRAINT "survey_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_tokens"
    ADD CONSTRAINT "survey_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_challenges"
    ADD CONSTRAINT "task_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_challenges"
    ADD CONSTRAINT "task_challenges_task_id_challenge_id_key" UNIQUE ("task_id", "challenge_id");



ALTER TABLE ONLY "public"."task_force_borrows"
    ADD CONSTRAINT "task_force_borrows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_force_requests"
    ADD CONSTRAINT "task_force_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_goals"
    ADD CONSTRAINT "task_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_milestones"
    ADD CONSTRAINT "task_milestones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_status_history"
    ADD CONSTRAINT "task_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transfer_requests"
    ADD CONSTRAINT "transfer_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_domains"
    ADD CONSTRAINT "user_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_domains"
    ADD CONSTRAINT "user_domains_user_id_domain_id_key" UNIQUE ("user_id", "domain_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_subscriptions"
    ADD CONSTRAINT "webhook_subscriptions_partner_id_entity_type_event_type_key" UNIQUE ("partner_id", "entity_type", "event_type");



ALTER TABLE ONLY "public"."webhook_subscriptions"
    ADD CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id");



CREATE INDEX "approval_requests_approver_idx" ON "public"."approval_requests" USING "btree" ("approver_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "approval_requests_requester_idx" ON "public"."approval_requests" USING "btree" ("requester_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "approval_requests_status_idx" ON "public"."approval_requests" USING "btree" ("status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "attachments_entity_idx" ON "public"."attachments" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "attachments_org_idx" ON "public"."attachments" USING "btree" ("organization_id");



CREATE INDEX "attachments_purpose_idx" ON "public"."attachments" USING "btree" ("purpose");



CREATE INDEX "challenge_goals_goal_idx" ON "public"."challenge_goals" USING "btree" ("department_goal_id");



CREATE UNIQUE INDEX "challenge_goals_uniq" ON "public"."challenge_goals" USING "btree" ("challenge_id", "department_goal_id");



CREATE INDEX "challenge_journal_challenge_idx" ON "public"."challenge_journal" USING "btree" ("challenge_id", "created_at" DESC);



CREATE INDEX "challenge_stakeholders_challenge_idx" ON "public"."challenge_stakeholders" USING "btree" ("challenge_id", "created_at");



CREATE INDEX "challenge_stakeholders_contact_idx" ON "public"."challenge_stakeholders" USING "btree" ("contact_id");



CREATE UNIQUE INDEX "contacts_email_unique" ON "public"."contacts" USING "btree" ("organization_id", "lower"("email")) WHERE (("email" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "contacts_org_idx" ON "public"."contacts" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "csa_challenge_idx" ON "public"."challenge_stakeholder_access" USING "btree" ("challenge_id");



CREATE INDEX "csa_stakeholder_idx" ON "public"."challenge_stakeholder_access" USING "btree" ("stakeholder_user_id");



CREATE INDEX "csa_token_idx" ON "public"."challenge_stakeholder_access" USING "btree" ("token");



CREATE INDEX "department_goals_dept_year_idx" ON "public"."department_goals" USING "btree" ("department_id", "year");



CREATE INDEX "department_goals_deputyship_idx" ON "public"."department_goals" USING "btree" ("deputyship_goal_id");



CREATE INDEX "email_batches_org_idx" ON "public"."email_batches" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_audit_actor" ON "public"."audit_logs" USING "btree" ("actor_id", "created_at" DESC) WHERE ("actor_id" IS NOT NULL);



CREATE INDEX "idx_audit_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "idx_audit_time" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_challenge_status_history_challenge" ON "public"."challenge_status_history" USING "btree" ("challenge_id");



CREATE INDEX "idx_challenges_assignee" ON "public"."challenges" USING "btree" ("assigned_to_id") WHERE (("deleted_at" IS NULL) AND ("archived_at" IS NULL));



CREATE INDEX "idx_challenges_domain" ON "public"."challenges" USING "btree" ("domain_id") WHERE (("deleted_at" IS NULL) AND ("archived_at" IS NULL));



CREATE UNIQUE INDEX "idx_challenges_external_source" ON "public"."challenges" USING "btree" ("organization_id", "source_system", "external_id") WHERE (("source_system" IS NOT NULL) AND ("external_id" IS NOT NULL));



CREATE INDEX "idx_challenges_organization_id" ON "public"."challenges" USING "btree" ("organization_id");



CREATE INDEX "idx_challenges_status" ON "public"."challenges" USING "btree" ("status") WHERE (("deleted_at" IS NULL) AND ("archived_at" IS NULL));



CREATE INDEX "idx_domains_organization_id" ON "public"."domains" USING "btree" ("organization_id");



CREATE INDEX "idx_endorsement_requests_endorsed" ON "public"."endorsement_requests" USING "btree" ("endorsed_user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_endorsement_requests_organization_id" ON "public"."endorsement_requests" USING "btree" ("organization_id");



CREATE INDEX "idx_endorsement_requests_task" ON "public"."endorsement_requests" USING "btree" ("task_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_investors_country" ON "public"."investors" USING "btree" ("country") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_investors_domain_type" ON "public"."investors" USING "btree" ("domain_type") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_investors_email" ON "public"."investors" USING "btree" ("email") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "idx_investors_external_source" ON "public"."investors" USING "btree" ("organization_id", "source_system", "external_id") WHERE (("source_system" IS NOT NULL) AND ("external_id" IS NOT NULL));



CREATE INDEX "idx_investors_organization_id" ON "public"."investors" USING "btree" ("organization_id");



CREATE INDEX "idx_messages_challenge" ON "public"."messages" USING "btree" ("challenge_id", "created_at") WHERE (("challenge_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_messages_organization_id" ON "public"."messages" USING "btree" ("organization_id");



CREATE INDEX "idx_messages_sender" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_messages_session" ON "public"."messages" USING "btree" ("session_id", "created_at") WHERE (("session_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_messages_task" ON "public"."messages" USING "btree" ("task_id", "created_at") WHERE (("task_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_notifications_organization_id" ON "public"."notifications" USING "btree" ("organization_id");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC) WHERE (("read" = false) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_organizations_active" ON "public"."organizations" USING "btree" ("is_active") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_organizations_source" ON "public"."organizations" USING "btree" ("source_system", "external_id") WHERE ("source_system" IS NOT NULL);



CREATE INDEX "idx_password_reset_pending" ON "public"."password_reset_requests" USING "btree" ("status") WHERE (("status" = 'pending'::"public"."pwd_reset_status") AND ("deleted_at" IS NULL));



CREATE INDEX "idx_password_reset_requests_organization_id" ON "public"."password_reset_requests" USING "btree" ("organization_id");



CREATE INDEX "idx_session_edit_history_session" ON "public"."session_edit_history" USING "btree" ("session_id");



CREATE INDEX "idx_session_links_challenge" ON "public"."session_links" USING "btree" ("challenge_id") WHERE ("challenge_id" IS NOT NULL);



CREATE INDEX "idx_session_links_organization_id" ON "public"."session_links" USING "btree" ("organization_id");



CREATE INDEX "idx_session_links_session" ON "public"."session_links" USING "btree" ("session_id");



CREATE INDEX "idx_session_links_task" ON "public"."session_links" USING "btree" ("task_id") WHERE ("task_id" IS NOT NULL);



CREATE INDEX "idx_sessions_creator" ON "public"."sessions" USING "btree" ("created_by_id") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "idx_sessions_external_source" ON "public"."sessions" USING "btree" ("organization_id", "source_system", "external_id") WHERE (("source_system" IS NOT NULL) AND ("external_id" IS NOT NULL));



CREATE INDEX "idx_sessions_has_pending_ai_tasks" ON "public"."sessions" USING "btree" ((("jsonb_array_length"("pending_ai_tasks") > 0))) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_sessions_meeting_date" ON "public"."sessions" USING "btree" ("meeting_date") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_sessions_number" ON "public"."sessions" USING "btree" ("organization_id", "meeting_number") WHERE ("meeting_number" IS NOT NULL);



CREATE INDEX "idx_sessions_organization_id" ON "public"."sessions" USING "btree" ("organization_id");



CREATE INDEX "idx_sessions_parent" ON "public"."sessions" USING "btree" ("parent_session_id") WHERE ("parent_session_id" IS NOT NULL);



CREATE INDEX "idx_sessions_participants" ON "public"."sessions" USING "gin" ("participant_ids");



CREATE INDEX "idx_sessions_status" ON "public"."sessions" USING "btree" ("status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_sub_domains_domain" ON "public"."sub_domains" USING "btree" ("domain_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_sub_domains_organization_id" ON "public"."sub_domains" USING "btree" ("organization_id");



CREATE INDEX "idx_task_challenges_challenge" ON "public"."task_challenges" USING "btree" ("challenge_id");



CREATE INDEX "idx_task_challenges_task" ON "public"."task_challenges" USING "btree" ("task_id");



CREATE INDEX "idx_task_status_history_task" ON "public"."task_status_history" USING "btree" ("task_id");



CREATE INDEX "idx_tasks_assignee" ON "public"."tasks" USING "btree" ("assigned_to_id") WHERE (("deleted_at" IS NULL) AND ("archived_at" IS NULL));



CREATE INDEX "idx_tasks_domain" ON "public"."tasks" USING "btree" ("domain_id") WHERE (("deleted_at" IS NULL) AND ("archived_at" IS NULL));



CREATE INDEX "idx_tasks_due_date" ON "public"."tasks" USING "btree" ("tat_due_date") WHERE (("deleted_at" IS NULL) AND ("archived_at" IS NULL) AND ("status" <> ALL (ARRAY['done'::"public"."task_status", 'cancelled'::"public"."task_status"])));



CREATE UNIQUE INDEX "idx_tasks_external_source" ON "public"."tasks" USING "btree" ("organization_id", "source_system", "external_id") WHERE (("source_system" IS NOT NULL) AND ("external_id" IS NOT NULL));



CREATE INDEX "idx_tasks_organization_id" ON "public"."tasks" USING "btree" ("organization_id");



CREATE INDEX "idx_tasks_source_session" ON "public"."tasks" USING "btree" ("source_session_id") WHERE ("source_session_id" IS NOT NULL);



CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status") WHERE (("deleted_at" IS NULL) AND ("archived_at" IS NULL));



CREATE INDEX "idx_tfb_member" ON "public"."task_force_borrows" USING "btree" ("assigned_member_id");



CREATE INDEX "idx_tfb_request" ON "public"."task_force_borrows" USING "btree" ("request_id");



CREATE INDEX "idx_tfb_to_admin" ON "public"."task_force_borrows" USING "btree" ("to_admin_id");



CREATE INDEX "idx_tfr_admin" ON "public"."task_force_requests" USING "btree" ("managing_admin_id");



CREATE INDEX "idx_tfr_subtask" ON "public"."task_force_requests" USING "btree" ("subtask_id");



CREATE INDEX "idx_tfr_task" ON "public"."task_force_requests" USING "btree" ("task_id");



CREATE INDEX "idx_transfer_requests_organization_id" ON "public"."transfer_requests" USING "btree" ("organization_id");



CREATE INDEX "idx_transfer_requests_status" ON "public"."transfer_requests" USING "btree" ("status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_transfer_requests_target_user" ON "public"."transfer_requests" USING "btree" ("target_user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_user_domains_domain" ON "public"."user_domains" USING "btree" ("domain_id");



CREATE INDEX "idx_user_domains_user" ON "public"."user_domains" USING "btree" ("user_id");



CREATE INDEX "idx_users_admin" ON "public"."users" USING "btree" ("admin_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "idx_users_external_source" ON "public"."users" USING "btree" ("organization_id", "source_system", "external_id") WHERE (("source_system" IS NOT NULL) AND ("external_id" IS NOT NULL));



CREATE INDEX "idx_users_organization_id" ON "public"."users" USING "btree" ("organization_id");



CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_vacation_requests_dates" ON "public"."vacation_requests" USING "btree" ("start_date", "end_date") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_vacation_requests_organization_id" ON "public"."vacation_requests" USING "btree" ("organization_id");



CREATE INDEX "idx_vacation_requests_status" ON "public"."vacation_requests" USING "btree" ("status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_vacation_requests_user" ON "public"."vacation_requests" USING "btree" ("user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_webhook_events_entity" ON "public"."webhook_events" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_webhook_events_pending" ON "public"."webhook_events" USING "btree" ("organization_id", "created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "monthly_performance_dept_month_idx" ON "public"."monthly_performance" USING "btree" ("department_id", "year_month");



CREATE UNIQUE INDEX "monthly_performance_user_month_uniq" ON "public"."monthly_performance" USING "btree" ("user_id", "year_month");



CREATE UNIQUE INDEX "performance_weights_org_dept_uniq" ON "public"."performance_weights" USING "btree" ("organization_id", COALESCE("department_id", '00000000-0000-0000-0000-000000000000'::"uuid"));



CREATE INDEX "sent_emails_batch_idx" ON "public"."sent_emails" USING "btree" ("batch_id");



CREATE INDEX "sent_emails_investor_idx" ON "public"."sent_emails" USING "btree" ("investor_id");



CREATE INDEX "sgp_deputyship_idx" ON "public"."strategic_goal_parents" USING "btree" ("deputyship_goal_id");



CREATE INDEX "sgp_org_idx" ON "public"."strategic_goal_parents" USING "btree" ("org_goal_id");



CREATE UNIQUE INDEX "strategic_goal_parents_uniq" ON "public"."strategic_goal_parents" USING "btree" ("deputyship_goal_id", "org_goal_id");



CREATE INDEX "strategic_goals_tier_year_idx" ON "public"."strategic_goals" USING "btree" ("organization_id", "tier", "year");



CREATE INDEX "task_goals_goal_idx" ON "public"."task_goals" USING "btree" ("department_goal_id");



CREATE UNIQUE INDEX "task_goals_uniq" ON "public"."task_goals" USING "btree" ("task_id", "department_goal_id");



CREATE INDEX "tasks_source_challenge_idx" ON "public"."tasks" USING "btree" ("source_challenge_id");



CREATE UNIQUE INDEX "uq_tfr_active_subtask" ON "public"."task_force_requests" USING "btree" ("subtask_id") WHERE (("status" = ANY (ARRAY['requested'::"text", 'sourcing'::"text", 'active'::"text"])) AND ("deleted_at" IS NULL));



CREATE OR REPLACE TRIGGER "trg_audit_challenge_semantic" AFTER UPDATE ON "public"."challenges" FOR EACH ROW EXECUTE FUNCTION "public"."audit_challenge_semantic"();



CREATE OR REPLACE TRIGGER "trg_audit_challenges" AFTER INSERT OR DELETE OR UPDATE ON "public"."challenges" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_domains" AFTER INSERT OR DELETE OR UPDATE ON "public"."domains" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_endorsement_requests" AFTER INSERT OR DELETE OR UPDATE ON "public"."endorsement_requests" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_investors" AFTER INSERT OR DELETE OR UPDATE ON "public"."investors" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_messages" AFTER INSERT OR DELETE OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_notifications" AFTER INSERT OR DELETE OR UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_password_reset_requests" AFTER INSERT OR DELETE OR UPDATE ON "public"."password_reset_requests" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_session_links" AFTER INSERT OR DELETE OR UPDATE ON "public"."session_links" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_session_semantic" AFTER UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."audit_session_semantic"();



CREATE OR REPLACE TRIGGER "trg_audit_sessions" AFTER INSERT OR DELETE OR UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_sub_domains" AFTER INSERT OR DELETE OR UPDATE ON "public"."sub_domains" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_task_challenges" AFTER INSERT OR DELETE OR UPDATE ON "public"."task_challenges" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_task_semantic" AFTER UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."audit_task_semantic"();



CREATE OR REPLACE TRIGGER "trg_audit_tasks" AFTER INSERT OR DELETE OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_transfer_requests" AFTER INSERT OR DELETE OR UPDATE ON "public"."transfer_requests" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_user_domains" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_domains" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_user_semantic" AFTER UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."audit_user_semantic"();



CREATE OR REPLACE TRIGGER "trg_audit_users" AFTER INSERT OR DELETE OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_vacation_requests" AFTER INSERT OR DELETE OR UPDATE ON "public"."vacation_requests" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_change"();



CREATE OR REPLACE TRIGGER "trg_audit_vacation_semantic" AFTER UPDATE ON "public"."vacation_requests" FOR EACH ROW EXECUTE FUNCTION "public"."audit_vacation_semantic"();



CREATE OR REPLACE TRIGGER "trg_cascade_admin_department" AFTER UPDATE OF "department_id" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."cascade_admin_department"();



CREATE OR REPLACE TRIGGER "trg_challenges_updated_at" BEFORE UPDATE ON "public"."challenges" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_domains_updated_at" BEFORE UPDATE ON "public"."domains" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_emit_investor_event" AFTER INSERT OR DELETE OR UPDATE ON "public"."investors" FOR EACH ROW EXECUTE FUNCTION "public"."emit_investor_event"();



CREATE OR REPLACE TRIGGER "trg_emit_session_event" AFTER INSERT OR DELETE OR UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."emit_session_event"();



CREATE OR REPLACE TRIGGER "trg_endorsement_requests_updated_at" BEFORE UPDATE ON "public"."endorsement_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_integration_partners_updated_at" BEFORE UPDATE ON "public"."integration_partners" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_investors_updated_at" BEFORE UPDATE ON "public"."investors" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_notify_approval_decision" AFTER UPDATE ON "public"."approval_requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_approval_decision"();



CREATE OR REPLACE TRIGGER "trg_notify_approval_request" AFTER INSERT ON "public"."approval_requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_approval_request"();



CREATE OR REPLACE TRIGGER "trg_notify_subtask_support" AFTER INSERT OR UPDATE OF "support_status" ON "public"."milestone_subtasks" FOR EACH ROW EXECUTE FUNCTION "public"."notify_subtask_support"();



CREATE OR REPLACE TRIGGER "trg_notify_task_assignment" AFTER INSERT OR UPDATE OF "assigned_to_id" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."notify_task_assignment"();



CREATE OR REPLACE TRIGGER "trg_notify_task_force_borrow" AFTER INSERT ON "public"."task_force_borrows" FOR EACH ROW EXECUTE FUNCTION "public"."notify_task_force_borrow"();



CREATE OR REPLACE TRIGGER "trg_notify_task_force_request" AFTER INSERT ON "public"."task_force_requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_task_force_request"();



CREATE OR REPLACE TRIGGER "trg_notify_task_force_status" AFTER UPDATE OF "status" ON "public"."task_force_requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_task_force_status"();



CREATE OR REPLACE TRIGGER "trg_notify_task_lifecycle" AFTER UPDATE OF "closure_requested_at", "closure_rejected_at", "declined_at", "status" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."notify_task_lifecycle"();



CREATE OR REPLACE TRIGGER "trg_notify_vacation_decision" AFTER UPDATE ON "public"."vacation_requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_vacation_decision"();



CREATE OR REPLACE TRIGGER "trg_notify_vacation_request" AFTER INSERT ON "public"."vacation_requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_vacation_request"();



CREATE OR REPLACE TRIGGER "trg_organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sessions_updated_at" BEFORE UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_meeting_number" BEFORE INSERT ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_meeting_number"();



CREATE OR REPLACE TRIGGER "trg_sub_domains_updated_at" BEFORE UPDATE ON "public"."sub_domains" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_session_department" BEFORE INSERT OR UPDATE OF "created_by_id" ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_session_department"();



CREATE OR REPLACE TRIGGER "trg_sync_task_department" BEFORE INSERT OR UPDATE OF "assigned_to_id" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."sync_task_department"();



CREATE OR REPLACE TRIGGER "trg_sync_user_department" BEFORE INSERT OR UPDATE OF "admin_id", "role", "department_id" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."sync_user_department"();



CREATE OR REPLACE TRIGGER "trg_task_force_complete" AFTER UPDATE OF "is_done" ON "public"."milestone_subtasks" FOR EACH ROW EXECUTE FUNCTION "public"."task_force_complete_on_subtask_done"();



CREATE OR REPLACE TRIGGER "trg_tasks_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_transfer_requests_updated_at" BEFORE UPDATE ON "public"."transfer_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_vacation_requests_updated_at" BEFORE UPDATE ON "public"."vacation_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_webhook_subs_updated_at" BEFORE UPDATE ON "public"."webhook_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."challenge_goals"
    ADD CONSTRAINT "challenge_goals_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_goals"
    ADD CONSTRAINT "challenge_goals_department_goal_id_fkey" FOREIGN KEY ("department_goal_id") REFERENCES "public"."department_goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_goals"
    ADD CONSTRAINT "challenge_goals_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."challenge_goals"
    ADD CONSTRAINT "challenge_goals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."challenge_journal"
    ADD CONSTRAINT "challenge_journal_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."challenge_journal"
    ADD CONSTRAINT "challenge_journal_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_journal"
    ADD CONSTRAINT "challenge_journal_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."challenge_stakeholder_access"
    ADD CONSTRAINT "challenge_stakeholder_access_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_stakeholder_access"
    ADD CONSTRAINT "challenge_stakeholder_access_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."challenge_stakeholder_access"
    ADD CONSTRAINT "challenge_stakeholder_access_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."challenge_stakeholder_access"
    ADD CONSTRAINT "challenge_stakeholder_access_stakeholder_user_id_fkey" FOREIGN KEY ("stakeholder_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_stakeholders"
    ADD CONSTRAINT "challenge_stakeholders_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_stakeholders"
    ADD CONSTRAINT "challenge_stakeholders_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."challenge_stakeholders"
    ADD CONSTRAINT "challenge_stakeholders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."challenge_stakeholders"
    ADD CONSTRAINT "challenge_stakeholders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."challenge_status_history"
    ADD CONSTRAINT "challenge_status_history_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_status_history"
    ADD CONSTRAINT "challenge_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_sub_domain_id_fkey" FOREIGN KEY ("sub_domain_id") REFERENCES "public"."sub_domains"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."department_goals"
    ADD CONSTRAINT "department_goals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."department_goals"
    ADD CONSTRAINT "department_goals_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."department_goals"
    ADD CONSTRAINT "department_goals_deputyship_goal_id_fkey" FOREIGN KEY ("deputyship_goal_id") REFERENCES "public"."strategic_goals"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."department_goals"
    ADD CONSTRAINT "department_goals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."domains"
    ADD CONSTRAINT "domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."email_batches"
    ADD CONSTRAINT "email_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."email_batches"
    ADD CONSTRAINT "email_batches_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."endorsement_requests"
    ADD CONSTRAINT "endorsement_requests_endorsed_user_id_fkey" FOREIGN KEY ("endorsed_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."endorsement_requests"
    ADD CONSTRAINT "endorsement_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."endorsement_requests"
    ADD CONSTRAINT "endorsement_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."endorsement_requests"
    ADD CONSTRAINT "endorsement_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integration_partners"
    ADD CONSTRAINT "integration_partners_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."investors"
    ADD CONSTRAINT "investors_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."investors"
    ADD CONSTRAINT "investors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."milestone_subtasks"
    ADD CONSTRAINT "milestone_subtasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."milestone_subtasks"
    ADD CONSTRAINT "milestone_subtasks_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "public"."task_milestones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_performance"
    ADD CONSTRAINT "monthly_performance_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."monthly_performance"
    ADD CONSTRAINT "monthly_performance_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."monthly_performance"
    ADD CONSTRAINT "monthly_performance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_module_settings"
    ADD CONSTRAINT "org_module_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."password_reset_requests"
    ADD CONSTRAINT "password_reset_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."password_reset_requests"
    ADD CONSTRAINT "password_reset_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."password_reset_requests"
    ADD CONSTRAINT "password_reset_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_weights"
    ADD CONSTRAINT "performance_weights_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_weights"
    ADD CONSTRAINT "performance_weights_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."performance_weights"
    ADD CONSTRAINT "performance_weights_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."sent_emails"
    ADD CONSTRAINT "sent_emails_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."email_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sent_emails"
    ADD CONSTRAINT "sent_emails_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sent_emails"
    ADD CONSTRAINT "sent_emails_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."session_edit_history"
    ADD CONSTRAINT "session_edit_history_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."session_edit_history"
    ADD CONSTRAINT "session_edit_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_links"
    ADD CONSTRAINT "session_links_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_links"
    ADD CONSTRAINT "session_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."session_links"
    ADD CONSTRAINT "session_links_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_links"
    ADD CONSTRAINT "session_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_last_edited_by_id_fkey" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_parent_session_id_fkey" FOREIGN KEY ("parent_session_id") REFERENCES "public"."sessions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."strategic_goal_parents"
    ADD CONSTRAINT "strategic_goal_parents_deputyship_goal_id_fkey" FOREIGN KEY ("deputyship_goal_id") REFERENCES "public"."strategic_goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strategic_goal_parents"
    ADD CONSTRAINT "strategic_goal_parents_org_goal_id_fkey" FOREIGN KEY ("org_goal_id") REFERENCES "public"."strategic_goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strategic_goal_parents"
    ADD CONSTRAINT "strategic_goal_parents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."strategic_goals"
    ADD CONSTRAINT "strategic_goals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."strategic_goals"
    ADD CONSTRAINT "strategic_goals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."strategic_goals"
    ADD CONSTRAINT "strategic_goals_parent_goal_id_fkey" FOREIGN KEY ("parent_goal_id") REFERENCES "public"."strategic_goals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sub_domains"
    ADD CONSTRAINT "sub_domains_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sub_domains"
    ADD CONSTRAINT "sub_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."survey_answers"
    ADD CONSTRAINT "survey_answers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."survey_answers"
    ADD CONSTRAINT "survey_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."survey_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_answers"
    ADD CONSTRAINT "survey_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."survey_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_distributions"
    ADD CONSTRAINT "survey_distributions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."survey_distributions"
    ADD CONSTRAINT "survey_distributions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."survey_distributions"
    ADD CONSTRAINT "survey_distributions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_questions"
    ADD CONSTRAINT "survey_questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."survey_questions"
    ADD CONSTRAINT "survey_questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "public"."survey_distributions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_respondent_investor_id_fkey" FOREIGN KEY ("respondent_investor_id") REFERENCES "public"."investors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_respondent_user_id_fkey" FOREIGN KEY ("respondent_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "public"."survey_tokens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."survey_tokens"
    ADD CONSTRAINT "survey_tokens_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "public"."survey_distributions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_tokens"
    ADD CONSTRAINT "survey_tokens_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."survey_tokens"
    ADD CONSTRAINT "survey_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."survey_tokens"
    ADD CONSTRAINT "survey_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."task_challenges"
    ADD CONSTRAINT "task_challenges_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_challenges"
    ADD CONSTRAINT "task_challenges_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_challenges"
    ADD CONSTRAINT "task_challenges_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_force_borrows"
    ADD CONSTRAINT "task_force_borrows_assigned_member_id_fkey" FOREIGN KEY ("assigned_member_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_force_borrows"
    ADD CONSTRAINT "task_force_borrows_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."task_force_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_force_borrows"
    ADD CONSTRAINT "task_force_borrows_to_admin_id_fkey" FOREIGN KEY ("to_admin_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_force_borrows"
    ADD CONSTRAINT "task_force_borrows_to_department_id_fkey" FOREIGN KEY ("to_department_id") REFERENCES "public"."departments"("id");



ALTER TABLE ONLY "public"."task_force_requests"
    ADD CONSTRAINT "task_force_requests_managing_admin_id_fkey" FOREIGN KEY ("managing_admin_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_force_requests"
    ADD CONSTRAINT "task_force_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_force_requests"
    ADD CONSTRAINT "task_force_requests_subtask_id_fkey" FOREIGN KEY ("subtask_id") REFERENCES "public"."milestone_subtasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_force_requests"
    ADD CONSTRAINT "task_force_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_goals"
    ADD CONSTRAINT "task_goals_department_goal_id_fkey" FOREIGN KEY ("department_goal_id") REFERENCES "public"."department_goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_goals"
    ADD CONSTRAINT "task_goals_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_goals"
    ADD CONSTRAINT "task_goals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."task_goals"
    ADD CONSTRAINT "task_goals_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_milestones"
    ADD CONSTRAINT "task_milestones_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_milestones"
    ADD CONSTRAINT "task_milestones_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_status_history"
    ADD CONSTRAINT "task_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_status_history"
    ADD CONSTRAINT "task_status_history_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_closure_requested_by_fkey" FOREIGN KEY ("closure_requested_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_declined_by_fkey" FOREIGN KEY ("declined_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_source_challenge_id_fkey" FOREIGN KEY ("source_challenge_id") REFERENCES "public"."challenges"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_source_session_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_sub_domain_id_fkey" FOREIGN KEY ("sub_domain_id") REFERENCES "public"."sub_domains"("id");



ALTER TABLE ONLY "public"."transfer_requests"
    ADD CONSTRAINT "transfer_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."transfer_requests"
    ADD CONSTRAINT "transfer_requests_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transfer_requests"
    ADD CONSTRAINT "transfer_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transfer_requests"
    ADD CONSTRAINT "transfer_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."transfer_requests"
    ADD CONSTRAINT "transfer_requests_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."transfer_requests"
    ADD CONSTRAINT "transfer_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_domains"
    ADD CONSTRAINT "user_domains_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_domains"
    ADD CONSTRAINT "user_domains_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."webhook_subscriptions"
    ADD CONSTRAINT "webhook_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."webhook_subscriptions"
    ADD CONSTRAINT "webhook_subscriptions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."integration_partners"("id") ON DELETE CASCADE;



ALTER TABLE "public"."approval_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "approval_requests_insert" ON "public"."approval_requests" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("requester_id" = "auth"."uid"()) AND ("status" = 'pending'::"public"."approval_status")));



CREATE POLICY "approval_requests_read" ON "public"."approval_requests" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (("requester_id" = "auth"."uid"()) OR ("approver_id" = "auth"."uid"()) OR ("public"."current_user_role"() = 'super_admin'::"public"."user_role"))));



CREATE POLICY "approval_requests_update" ON "public"."approval_requests" FOR UPDATE USING ((("organization_id" = "public"."current_user_organization_id"()) AND (("approver_id" = "auth"."uid"()) OR ("public"."current_user_role"() = 'super_admin'::"public"."user_role"))));



ALTER TABLE "public"."attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attachments_insert" ON "public"."attachments" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"()) AND ("uploaded_by_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."organizations" "o"
  WHERE (("o"."id" = "attachments"."organization_id") AND ("o"."attachments_enabled" = true))))));



CREATE POLICY "attachments_read" ON "public"."attachments" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



CREATE POLICY "attachments_update" ON "public"."attachments" FOR UPDATE USING ((("organization_id" = "public"."current_user_organization_id"()) AND (("uploaded_by_id" = "auth"."uid"()) OR "public"."current_user_is_manager"()))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_no_writes" ON "public"."audit_logs" USING (false) WITH CHECK (false);



CREATE POLICY "audit_logs_read" ON "public"."audit_logs" FOR SELECT USING ((("public"."current_user_role"() = 'super_admin'::"public"."user_role") OR (("public"."current_user_role"() = 'admin'::"public"."user_role") AND (("actor_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "audit_logs"."actor_id") AND ("u"."admin_id" = "auth"."uid"())))))) OR (("public"."current_user_role"() = ANY (ARRAY['rm'::"public"."user_role", 'arm'::"public"."user_role"])) AND ("actor_id" = "auth"."uid"()))));



ALTER TABLE "public"."challenge_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "challenge_goals_read" ON "public"."challenge_goals" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



CREATE POLICY "challenge_goals_write" ON "public"."challenge_goals" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_is_super"() OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role"))))))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."challenge_journal" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "challenge_journal_insert" ON "public"."challenge_journal" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND ("organization_id" = "public"."current_user_organization_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."challenges" "c"
  WHERE (("c"."id" = "challenge_journal"."challenge_id") AND ("c"."organization_id" = "public"."current_user_organization_id"()))))));



CREATE POLICY "challenge_journal_read" ON "public"."challenge_journal" FOR SELECT USING (((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())) OR "public"."stakeholder_has_active_access"("challenge_id")));



CREATE POLICY "challenge_journal_update" ON "public"."challenge_journal" FOR UPDATE USING ((("author_id" = "auth"."uid"()) AND ("edited_at" IS NULL) AND ("created_at" > ("now"() - '01:00:00'::interval)))) WITH CHECK (("author_id" = "auth"."uid"()));



ALTER TABLE "public"."challenge_stakeholder_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."challenge_stakeholders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "challenge_stakeholders_delete" ON "public"."challenge_stakeholders" FOR DELETE USING (("public"."current_user_is_manager"() AND ("organization_id" = "public"."current_user_organization_id"())));



CREATE POLICY "challenge_stakeholders_insert" ON "public"."challenge_stakeholders" FOR INSERT WITH CHECK (("public"."current_user_is_manager"() AND ("organization_id" = "public"."current_user_organization_id"()) AND ("created_by_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."challenges" "c"
  WHERE (("c"."id" = "challenge_stakeholders"."challenge_id") AND ("c"."organization_id" = "public"."current_user_organization_id"()))))));



CREATE POLICY "challenge_stakeholders_read" ON "public"."challenge_stakeholders" FOR SELECT USING (("organization_id" = "public"."current_user_organization_id"()));



CREATE POLICY "challenge_stakeholders_update" ON "public"."challenge_stakeholders" FOR UPDATE USING (("public"."current_user_is_manager"() AND ("organization_id" = "public"."current_user_organization_id"()))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."challenge_status_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "challenge_status_history_insert" ON "public"."challenge_status_history" FOR INSERT WITH CHECK ((("changed_by_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."challenges" "c"
  WHERE (("c"."id" = "challenge_status_history"."challenge_id") AND ("c"."organization_id" = "public"."current_user_organization_id"()))))));



CREATE POLICY "challenge_status_history_read" ON "public"."challenge_status_history" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."challenges" "c"
  WHERE (("c"."id" = "challenge_status_history"."challenge_id") AND ("c"."organization_id" = "public"."current_user_organization_id"())))) AND (NOT "public"."current_user_is_stakeholder"())));



ALTER TABLE "public"."challenges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "challenges_delete" ON "public"."challenges" FOR DELETE USING ("public"."current_user_is_super"());



CREATE POLICY "challenges_insert" ON "public"."challenges" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("created_by_id" = "auth"."uid"())));



CREATE POLICY "challenges_read" ON "public"."challenges" FOR SELECT USING (((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())) OR "public"."stakeholder_has_active_access"("id")));



CREATE POLICY "challenges_update" ON "public"."challenges" FOR UPDATE USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_is_manager"() OR ("assigned_to_id" = "auth"."uid"()) OR (("created_by_id" = "auth"."uid"()) AND ("status" = 'open'::"public"."challenge_status"))))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_insert" ON "public"."contacts" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("created_by_id" = "auth"."uid"())));



CREATE POLICY "contacts_read" ON "public"."contacts" FOR SELECT USING (("organization_id" = "public"."current_user_organization_id"()));



CREATE POLICY "contacts_update" ON "public"."contacts" FOR UPDATE USING (("organization_id" = "public"."current_user_organization_id"())) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



CREATE POLICY "csa_insert" ON "public"."challenge_stakeholder_access" FOR INSERT WITH CHECK (("public"."current_user_is_manager"() AND ("organization_id" = "public"."current_user_organization_id"()) AND ("created_by_id" = "auth"."uid"())));



CREATE POLICY "csa_read" ON "public"."challenge_stakeholder_access" FOR SELECT USING (((("organization_id" = "public"."current_user_organization_id"()) AND "public"."current_user_is_manager"()) OR ("stakeholder_user_id" = "auth"."uid"())));



CREATE POLICY "csa_update" ON "public"."challenge_stakeholder_access" FOR UPDATE USING (("public"."current_user_is_manager"() AND ("organization_id" = "public"."current_user_organization_id"()))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."department_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "department_goals_read" ON "public"."department_goals" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"()) AND ("public"."current_user_is_super"() OR ("department_id" = "public"."current_user_department_id"()))));



CREATE POLICY "department_goals_write" ON "public"."department_goals" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_is_super"() OR (("department_id" = "public"."current_user_department_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role")))))))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "departments_read" ON "public"."departments" FOR SELECT USING (("organization_id" = "public"."current_user_organization_id"()));



CREATE POLICY "departments_super_write" ON "public"."departments" USING ((("organization_id" = "public"."current_user_organization_id"()) AND "public"."current_user_is_super"())) WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND "public"."current_user_is_super"()));



ALTER TABLE "public"."domains" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "domains_read" ON "public"."domains" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "domains_super_admin" ON "public"."domains" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = 'super_admin'::"public"."user_role"))) WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = 'super_admin'::"public"."user_role")));



CREATE POLICY "domains_write_super" ON "public"."domains" USING (("public"."current_user_role"() = 'super_admin'::"public"."user_role"));



ALTER TABLE "public"."email_batches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_batches_read" ON "public"."email_batches" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



ALTER TABLE "public"."endorsement_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "endorsement_requests_insert" ON "public"."endorsement_requests" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = ANY (ARRAY['rm'::"public"."user_role", 'arm'::"public"."user_role", 'admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))));



CREATE POLICY "endorsement_requests_read" ON "public"."endorsement_requests" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "endorsement_requests_super_all" ON "public"."endorsement_requests" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."integration_partners" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_partners_read" ON "public"."integration_partners" FOR SELECT USING (("organization_id" = ( SELECT "users"."organization_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "integration_partners_super_admin" ON "public"."integration_partners" USING (("public"."current_user_role"() = 'super_admin'::"public"."user_role")) WITH CHECK (("public"."current_user_role"() = 'super_admin'::"public"."user_role"));



ALTER TABLE "public"."investors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "investors_delete" ON "public"."investors" FOR DELETE USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))));



CREATE POLICY "investors_insert" ON "public"."investors" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = ANY (ARRAY['rm'::"public"."user_role", 'arm'::"public"."user_role", 'admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))));



CREATE POLICY "investors_read" ON "public"."investors" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("auth"."uid"() IS NOT NULL) AND (("deleted_at" IS NULL) OR ("public"."current_user_role"() = 'super_admin'::"public"."user_role"))));



CREATE POLICY "investors_update" ON "public"."investors" FOR UPDATE USING ((("organization_id" = "public"."current_user_organization_id"()) AND (("public"."current_user_role"() = 'super_admin'::"public"."user_role") OR ("public"."current_user_role"() = 'admin'::"public"."user_role") OR (("public"."current_user_role"() = ANY (ARRAY['rm'::"public"."user_role", 'arm'::"public"."user_role"])) AND ("created_by_id" = "auth"."uid"()))))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_insert" ON "public"."messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND ((("task_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE ("t"."id" = "messages"."task_id")))) OR (("challenge_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."challenges" "c"
  WHERE ("c"."id" = "messages"."challenge_id")))) OR (("session_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."sessions" "s"
  WHERE ("s"."id" = "messages"."session_id")))))));



CREATE POLICY "messages_read" ON "public"."messages" FOR SELECT USING ((("deleted_at" IS NULL) AND ("auth"."uid"() IS NOT NULL) AND ((("task_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE ("t"."id" = "messages"."task_id")))) OR (("challenge_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."challenges" "c"
  WHERE ("c"."id" = "messages"."challenge_id")))) OR (("session_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."sessions" "s"
  WHERE ("s"."id" = "messages"."session_id")))))));



CREATE POLICY "messages_update" ON "public"."messages" FOR UPDATE USING (("sender_id" = "auth"."uid"())) WITH CHECK (("sender_id" = "auth"."uid"()));



ALTER TABLE "public"."milestone_subtasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "milestone_subtasks_assignee_write" ON "public"."milestone_subtasks" USING ((EXISTS ( SELECT 1
   FROM ("public"."task_milestones" "m"
     JOIN "public"."tasks" "t" ON (("t"."id" = "m"."task_id")))
  WHERE (("m"."id" = "milestone_subtasks"."milestone_id") AND ("t"."assigned_to_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."task_milestones" "m"
     JOIN "public"."tasks" "t" ON (("t"."id" = "m"."task_id")))
  WHERE (("m"."id" = "milestone_subtasks"."milestone_id") AND ("t"."assigned_to_id" = "auth"."uid"())))));



CREATE POLICY "milestone_subtasks_owner_update" ON "public"."milestone_subtasks" FOR UPDATE USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("assigned_to_id" = "auth"."uid"()))) WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("assigned_to_id" = "auth"."uid"())));



CREATE POLICY "milestone_subtasks_read" ON "public"."milestone_subtasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."task_milestones" "m"
     JOIN "public"."tasks" "t" ON (("t"."id" = "m"."task_id")))
  WHERE (("m"."id" = "milestone_subtasks"."milestone_id") AND ("t"."organization_id" = "public"."current_user_organization_id"())))));



CREATE POLICY "milestone_subtasks_super" ON "public"."milestone_subtasks" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'super_admin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'super_admin'::"public"."user_role")))));



CREATE POLICY "monthly_perf_read" ON "public"."monthly_performance" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"()) AND (("user_id" = "auth"."uid"()) OR "public"."current_user_is_super"() OR ("department_id" = "public"."current_user_department_id"()))));



CREATE POLICY "monthly_perf_write" ON "public"."monthly_performance" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_is_super"() OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ('configure_performance'::"public"."user_permission" = ANY ("u"."permissions")))))))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."monthly_performance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_insert" ON "public"."notifications" FOR INSERT WITH CHECK (false);



CREATE POLICY "notifications_read" ON "public"."notifications" FOR SELECT USING ((("deleted_at" IS NULL) AND (("user_id" = "auth"."uid"()) OR ("public"."current_user_role"() = 'super_admin'::"public"."user_role"))));



CREATE POLICY "notifications_update" ON "public"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "oms_insert" ON "public"."org_module_settings" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND "public"."current_user_can_manage_modules"()));



CREATE POLICY "oms_read" ON "public"."org_module_settings" FOR SELECT USING (("organization_id" = "public"."current_user_organization_id"()));



CREATE POLICY "oms_update" ON "public"."org_module_settings" FOR UPDATE USING ((("organization_id" = "public"."current_user_organization_id"()) AND "public"."current_user_can_manage_modules"())) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."org_module_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_attachments_switch" ON "public"."organizations" FOR UPDATE USING ((("id" = "public"."current_user_organization_id"()) AND "public"."current_user_can_manage_attachments"())) WITH CHECK (("id" = "public"."current_user_organization_id"()));



CREATE POLICY "organizations_read_own" ON "public"."organizations" FOR SELECT USING (("id" = ( SELECT "users"."organization_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "organizations_super_admin" ON "public"."organizations" USING (("public"."current_user_role"() = 'super_admin'::"public"."user_role")) WITH CHECK (("public"."current_user_role"() = 'super_admin'::"public"."user_role"));



CREATE POLICY "organizations_super_update" ON "public"."organizations" FOR UPDATE USING (("public"."current_user_is_super"() AND ("id" = "public"."current_user_organization_id"()))) WITH CHECK (("public"."current_user_is_super"() AND ("id" = "public"."current_user_organization_id"())));



CREATE POLICY "password_reset_insert" ON "public"."password_reset_requests" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "password_reset_read" ON "public"."password_reset_requests" FOR SELECT USING (("public"."is_admin_or_super"() OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."password_reset_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "password_reset_requests_insert" ON "public"."password_reset_requests" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = ANY (ARRAY['rm'::"public"."user_role", 'arm'::"public"."user_role", 'admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))));



CREATE POLICY "password_reset_requests_read" ON "public"."password_reset_requests" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "password_reset_requests_super_all" ON "public"."password_reset_requests" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



CREATE POLICY "password_reset_resolve" ON "public"."password_reset_requests" FOR UPDATE USING ("public"."is_admin_or_super"()) WITH CHECK ("public"."is_admin_or_super"());



CREATE POLICY "perf_weights_read" ON "public"."performance_weights" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



CREATE POLICY "perf_weights_write" ON "public"."performance_weights" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_is_super"() OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ('configure_performance'::"public"."user_permission" = ANY ("u"."permissions")))))))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."performance_weights" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sent_emails" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sent_emails_read" ON "public"."sent_emails" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



ALTER TABLE "public"."session_edit_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_edit_history_insert" ON "public"."session_edit_history" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("edited_by_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."sessions" "s"
  WHERE (("s"."id" = "session_edit_history"."session_id") AND ("s"."organization_id" = "public"."current_user_organization_id"()))))));



CREATE POLICY "session_edit_history_read" ON "public"."session_edit_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."sessions" "s"
  WHERE ("s"."id" = "session_edit_history"."session_id"))));



ALTER TABLE "public"."session_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_links_admin_plus" ON "public"."session_links" USING ("public"."is_admin_or_super"()) WITH CHECK ("public"."is_admin_or_super"());



CREATE POLICY "session_links_read" ON "public"."session_links" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."sessions" "s"
  WHERE ("s"."id" = "session_links"."session_id"))));



ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sessions_delete" ON "public"."sessions" FOR DELETE USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))));



CREATE POLICY "sessions_dept_wall" ON "public"."sessions" AS RESTRICTIVE USING (("public"."current_user_is_super"() OR ("department_id" = "public"."current_user_department_id"()) OR (EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."source_session_id" = "sessions"."id") AND (("t"."assigned_to_id" = "auth"."uid"()) OR ("t"."created_by_id" = "auth"."uid"())))))));



CREATE POLICY "sessions_insert" ON "public"."sessions" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = ANY (ARRAY['rm'::"public"."user_role", 'arm'::"public"."user_role", 'admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))));



CREATE POLICY "sessions_read" ON "public"."sessions" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("auth"."uid"() IS NOT NULL) AND (("deleted_at" IS NULL) OR ("public"."current_user_role"() = 'super_admin'::"public"."user_role")) AND (("public"."current_user_role"() = ANY (ARRAY['super_admin'::"public"."user_role", 'admin'::"public"."user_role"])) OR ("created_by_id" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("participant_ids")))));



CREATE POLICY "sessions_read_task_assignee" ON "public"."sessions" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("deleted_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."source_session_id" = "sessions"."id") AND ("t"."deleted_at" IS NULL) AND (("t"."assigned_to_id" = "auth"."uid"()) OR ("t"."created_by_id" = "auth"."uid"())))))));



CREATE POLICY "sessions_update" ON "public"."sessions" FOR UPDATE USING ((("organization_id" = "public"."current_user_organization_id"()) AND (("public"."current_user_role"() = ANY (ARRAY['super_admin'::"public"."user_role", 'admin'::"public"."user_role"])) OR ("created_by_id" = "auth"."uid"())))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



CREATE POLICY "sgp_read" ON "public"."strategic_goal_parents" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



CREATE POLICY "sgp_write" ON "public"."strategic_goal_parents" USING ((("organization_id" = "public"."current_user_organization_id"()) AND "public"."current_user_is_super"())) WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND "public"."current_user_is_super"()));



ALTER TABLE "public"."strategic_goal_parents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."strategic_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "strategic_goals_read" ON "public"."strategic_goals" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



CREATE POLICY "strategic_goals_write" ON "public"."strategic_goals" USING ((("organization_id" = "public"."current_user_organization_id"()) AND "public"."current_user_is_super"())) WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND "public"."current_user_is_super"()));



ALTER TABLE "public"."sub_domains" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sub_domains_read" ON "public"."sub_domains" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "sub_domains_super_admin" ON "public"."sub_domains" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = 'super_admin'::"public"."user_role"))) WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = 'super_admin'::"public"."user_role")));



CREATE POLICY "sub_domains_write_super" ON "public"."sub_domains" USING (("public"."current_user_role"() = 'super_admin'::"public"."user_role"));



ALTER TABLE "public"."survey_answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "survey_answers_read" ON "public"."survey_answers" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



ALTER TABLE "public"."survey_distributions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "survey_distributions_read" ON "public"."survey_distributions" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



CREATE POLICY "survey_distributions_write" ON "public"."survey_distributions" USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"()))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."survey_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "survey_questions_read" ON "public"."survey_questions" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



CREATE POLICY "survey_questions_write" ON "public"."survey_questions" USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"()))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."survey_responses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "survey_responses_read" ON "public"."survey_responses" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



ALTER TABLE "public"."survey_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "survey_tokens_read" ON "public"."survey_tokens" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



CREATE POLICY "survey_tokens_write" ON "public"."survey_tokens" USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"()))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."surveys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "surveys_read" ON "public"."surveys" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



CREATE POLICY "surveys_write" ON "public"."surveys" USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"()))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."task_challenges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_challenges_admin_plus" ON "public"."task_challenges" USING ("public"."is_admin_or_super"()) WITH CHECK (("public"."is_admin_or_super"() AND ("linked_by_id" = "auth"."uid"())));



CREATE POLICY "task_challenges_read" ON "public"."task_challenges" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE ("t"."id" = "task_challenges"."task_id"))));



ALTER TABLE "public"."task_force_borrows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_force_borrows_insert" ON "public"."task_force_borrows" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."task_force_requests" "r"
  WHERE (("r"."id" = "task_force_borrows"."request_id") AND ("r"."managing_admin_id" = "auth"."uid"())))));



CREATE POLICY "task_force_borrows_read" ON "public"."task_force_borrows" FOR SELECT USING ((("to_admin_id" = "auth"."uid"()) OR ("assigned_member_id" = "auth"."uid"()) OR "public"."current_user_is_super"() OR "public"."tf_user_owns_request"("request_id")));



CREATE POLICY "task_force_borrows_update" ON "public"."task_force_borrows" FOR UPDATE USING ((("to_admin_id" = "auth"."uid"()) OR "public"."current_user_is_super"() OR (EXISTS ( SELECT 1
   FROM "public"."task_force_requests" "r"
  WHERE (("r"."id" = "task_force_borrows"."request_id") AND ("r"."managing_admin_id" = "auth"."uid"())))))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."task_force_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_force_requests_insert" ON "public"."task_force_requests" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("requested_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_force_requests"."task_id") AND ("t"."assigned_to_id" = "auth"."uid"()))))));



CREATE POLICY "task_force_requests_read" ON "public"."task_force_requests" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (("requested_by" = "auth"."uid"()) OR ("managing_admin_id" = "auth"."uid"()) OR "public"."current_user_is_super"() OR "public"."tf_user_in_borrow"("id"))));



CREATE POLICY "task_force_requests_update" ON "public"."task_force_requests" FOR UPDATE USING ((("managing_admin_id" = "auth"."uid"()) OR ("requested_by" = "auth"."uid"()) OR "public"."current_user_is_super"())) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."task_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_goals_read" ON "public"."task_goals" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (NOT "public"."current_user_is_stakeholder"())));



CREATE POLICY "task_goals_write" ON "public"."task_goals" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_is_super"() OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role"))))))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."task_milestones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_milestones_assignee_write" ON "public"."task_milestones" TO "authenticated" USING ((("organization_id" = "public"."current_user_organization_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_milestones"."task_id") AND ("t"."assigned_to_id" = "auth"."uid"())))))) WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_milestones"."task_id") AND ("t"."assigned_to_id" = "auth"."uid"()))))));



CREATE POLICY "task_milestones_read" ON "public"."task_milestones" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."current_user_organization_id"()));



CREATE POLICY "task_milestones_super" ON "public"."task_milestones" TO "authenticated" USING (("public"."current_user_role"() = 'super_admin'::"public"."user_role")) WITH CHECK (("public"."current_user_role"() = 'super_admin'::"public"."user_role"));



ALTER TABLE "public"."task_status_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_status_history_insert" ON "public"."task_status_history" FOR INSERT TO "authenticated" WITH CHECK ((("changed_by_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_status_history"."task_id") AND ("t"."organization_id" = "public"."current_user_organization_id"()))))));



CREATE POLICY "task_status_history_read" ON "public"."task_status_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE ("t"."id" = "task_status_history"."task_id"))));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_admin_domain" ON "public"."tasks" USING ((("public"."current_user_role"() = 'admin'::"public"."user_role") AND ("domain_id" IN ( SELECT "public"."current_user_domain_ids"() AS "current_user_domain_ids")))) WITH CHECK ((("public"."current_user_role"() = 'admin'::"public"."user_role") AND ("domain_id" IN ( SELECT "public"."current_user_domain_ids"() AS "current_user_domain_ids"))));



CREATE POLICY "tasks_delete" ON "public"."tasks" FOR DELETE USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))));



CREATE POLICY "tasks_dept_wall" ON "public"."tasks" AS RESTRICTIVE FOR SELECT USING (("public"."current_user_is_super"() OR ("department_id" = "public"."current_user_department_id"()) OR "public"."user_owns_subtask_on_task"("id")));



CREATE POLICY "tasks_insert_self" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_permission"('create_tasks'::"public"."user_permission") AND ("created_by_id" = "auth"."uid"()) AND ("organization_id" = "public"."current_user_organization_id"())));



CREATE POLICY "tasks_read" ON "public"."tasks" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("auth"."uid"() IS NOT NULL) AND (("deleted_at" IS NULL) OR ("public"."current_user_role"() = 'super_admin'::"public"."user_role"))));



CREATE POLICY "tasks_rm_own" ON "public"."tasks" FOR UPDATE USING ((("public"."current_user_role"() = ANY (ARRAY['rm'::"public"."user_role", 'arm'::"public"."user_role"])) AND (("assigned_to_id" = "auth"."uid"()) OR ("created_by_id" = "auth"."uid"())))) WITH CHECK ((("assigned_to_id" = "auth"."uid"()) OR ("created_by_id" = "auth"."uid"())));



CREATE POLICY "tasks_rm_select" ON "public"."tasks" FOR SELECT USING ((("public"."current_user_role"() = ANY (ARRAY['rm'::"public"."user_role", 'arm'::"public"."user_role"])) AND (("assigned_to_id" = "auth"."uid"()) OR ("created_by_id" = "auth"."uid"()))));



CREATE POLICY "tasks_super" ON "public"."tasks" USING (("public"."current_user_role"() = 'super_admin'::"public"."user_role"));



CREATE POLICY "tasks_update" ON "public"."tasks" FOR UPDATE USING ((("organization_id" = "public"."current_user_organization_id"()) AND (("public"."current_user_role"() = ANY (ARRAY['super_admin'::"public"."user_role", 'admin'::"public"."user_role"])) OR ("assigned_to_id" = "auth"."uid"()) OR ("created_by_id" = "auth"."uid"())))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."transfer_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transfer_requests_insert" ON "public"."transfer_requests" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = ANY (ARRAY['rm'::"public"."user_role", 'arm'::"public"."user_role", 'admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))));



CREATE POLICY "transfer_requests_read" ON "public"."transfer_requests" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "transfer_requests_requester_cancel" ON "public"."transfer_requests" FOR UPDATE USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("requester_id" = "auth"."uid"()))) WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("requester_id" = "auth"."uid"())));



CREATE POLICY "transfer_requests_super_all" ON "public"."transfer_requests" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."user_domains" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_domains_admin" ON "public"."user_domains" USING ((("public"."current_user_role"() = 'admin'::"public"."user_role") AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "user_domains"."user_id") AND ("u"."admin_id" = "auth"."uid"())))))) WITH CHECK ((("public"."current_user_role"() = 'admin'::"public"."user_role") AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "user_domains"."user_id") AND ("u"."admin_id" = "auth"."uid"()))))));



CREATE POLICY "user_domains_read" ON "public"."user_domains" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "user_domains_super" ON "public"."user_domains" USING (("public"."current_user_role"() = 'super_admin'::"public"."user_role"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_admin_manage" ON "public"."users" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = 'admin'::"public"."user_role") AND ("admin_id" = "auth"."uid"()) AND ("role" = ANY (ARRAY['rm'::"public"."user_role", 'arm'::"public"."user_role"])))) WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = 'admin'::"public"."user_role") AND ("admin_id" = "auth"."uid"()) AND ("role" = ANY (ARRAY['rm'::"public"."user_role", 'arm'::"public"."user_role"]))));



CREATE POLICY "users_read" ON "public"."users" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("auth"."uid"() IS NOT NULL) AND (("deleted_at" IS NULL) OR ("public"."current_user_role"() = 'super_admin'::"public"."user_role"))));



CREATE POLICY "users_self_update" ON "public"."users" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK ((("id" = "auth"."uid"()) AND ("organization_id" = "public"."current_user_organization_id"())));



CREATE POLICY "users_super_all" ON "public"."users" USING ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = 'super_admin'::"public"."user_role"))) WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("public"."current_user_role"() = 'super_admin'::"public"."user_role")));



ALTER TABLE "public"."vacation_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vacation_requests_insert" ON "public"."vacation_requests" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_user_organization_id"()) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "vacation_requests_read" ON "public"."vacation_requests" FOR SELECT USING ((("organization_id" = "public"."current_user_organization_id"()) AND (("user_id" = "auth"."uid"()) OR "public"."current_user_is_super"() OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "vacation_requests"."user_id") AND ("u"."admin_id" = "auth"."uid"())))))));



CREATE POLICY "vacation_requests_update" ON "public"."vacation_requests" FOR UPDATE USING ((("organization_id" = "public"."current_user_organization_id"()) AND (("user_id" = "auth"."uid"()) OR "public"."current_user_is_super"() OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "vacation_requests"."user_id") AND ("u"."admin_id" = "auth"."uid"()))))))) WITH CHECK (("organization_id" = "public"."current_user_organization_id"()));



ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhook_events_read" ON "public"."webhook_events" FOR SELECT USING (("organization_id" = ( SELECT "users"."organization_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "webhook_subs_read" ON "public"."webhook_subscriptions" FOR SELECT USING (("organization_id" = ( SELECT "users"."organization_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "webhook_subs_super_admin" ON "public"."webhook_subscriptions" USING (("public"."current_user_role"() = 'super_admin'::"public"."user_role")) WITH CHECK (("public"."current_user_role"() = 'super_admin'::"public"."user_role"));



ALTER TABLE "public"."webhook_subscriptions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_borrow"("p_borrow_id" "uuid", "p_member_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_borrow"("p_borrow_id" "uuid", "p_member_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_borrow"("p_borrow_id" "uuid", "p_member_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_meeting_number"("p_meeting_date" timestamp with time zone, "p_org_id" "uuid", "p_type" "text", "p_parent_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_meeting_number"("p_meeting_date" timestamp with time zone, "p_org_id" "uuid", "p_type" "text", "p_parent_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_meeting_number"("p_meeting_date" timestamp with time zone, "p_org_id" "uuid", "p_type" "text", "p_parent_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_actor_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_actor_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_actor_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_approval_semantic"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_approval_semantic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_approval_semantic"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_challenge_semantic"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_challenge_semantic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_challenge_semantic"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_log_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_log_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_log_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_session_semantic"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_session_semantic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_session_semantic"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_task_semantic"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_task_semantic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_task_semantic"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_user_semantic"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_user_semantic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_user_semantic"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_vacation_semantic"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_vacation_semantic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_vacation_semantic"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_write_challenge_journal"("p_challenge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_write_challenge_journal"("p_challenge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_write_challenge_journal"("p_challenge_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cascade_admin_department"() TO "anon";
GRANT ALL ON FUNCTION "public"."cascade_admin_department"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cascade_admin_department"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_admin_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_admin_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_admin_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_admin_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_can_manage_attachments"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_can_manage_attachments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_can_manage_attachments"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_can_manage_modules"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_can_manage_modules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_can_manage_modules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_department_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_department_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_department_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_domain_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_domain_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_domain_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_is_manager"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_is_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_is_manager"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_is_stakeholder"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_is_stakeholder"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_is_stakeholder"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_is_super"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_is_super"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_is_super"() TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_organization"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_organization"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_organization"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_organization"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_organization_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_organization_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_organization_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."emit_investor_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."emit_investor_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."emit_investor_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."emit_session_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."emit_session_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."emit_session_event"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."emit_webhook_event"("p_entity_type" "text", "p_entity_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."emit_webhook_event"("p_entity_type" "text", "p_entity_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."emit_webhook_event"("p_entity_type" "text", "p_entity_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."emit_webhook_event"("p_entity_type" "text", "p_entity_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_permission"("perm" "public"."user_permission") TO "anon";
GRANT ALL ON FUNCTION "public"."has_permission"("perm" "public"."user_permission") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("perm" "public"."user_permission") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_super_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_super"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_super"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_super"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_approval_decision"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_approval_decision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_approval_decision"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_approval_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_approval_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_approval_request"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_subtask_support"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_subtask_support"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_subtask_support"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_task_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_task_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_task_assignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_task_force_borrow"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_task_force_borrow"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_task_force_borrow"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_task_force_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_task_force_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_task_force_request"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_task_force_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_task_force_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_task_force_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_task_lifecycle"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_task_lifecycle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_task_lifecycle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_vacation_decision"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_vacation_decision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_vacation_decision"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_vacation_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_vacation_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_vacation_request"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_meeting_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_meeting_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_meeting_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."stakeholder_has_active_access"("p_challenge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."stakeholder_has_active_access"("p_challenge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stakeholder_has_active_access"("p_challenge_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_session_department"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_session_department"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_session_department"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_task_department"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_task_department"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_task_department"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_user_department"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_user_department"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_user_department"() TO "service_role";



GRANT ALL ON FUNCTION "public"."task_force_complete_on_subtask_done"() TO "anon";
GRANT ALL ON FUNCTION "public"."task_force_complete_on_subtask_done"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."task_force_complete_on_subtask_done"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tf_user_in_borrow"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."tf_user_in_borrow"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tf_user_in_borrow"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."tf_user_owns_request"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."tf_user_owns_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tf_user_owns_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_owns_subtask_on_task"("p_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_owns_subtask_on_task"("p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_owns_subtask_on_task"("p_task_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."approval_requests" TO "anon";
GRANT ALL ON TABLE "public"."approval_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_requests" TO "service_role";



GRANT ALL ON TABLE "public"."attachments" TO "anon";
GRANT ALL ON TABLE "public"."attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."attachments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_goals" TO "anon";
GRANT ALL ON TABLE "public"."challenge_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_goals" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_journal" TO "anon";
GRANT ALL ON TABLE "public"."challenge_journal" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_journal" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_stakeholder_access" TO "anon";
GRANT ALL ON TABLE "public"."challenge_stakeholder_access" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_stakeholder_access" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_stakeholders" TO "anon";
GRANT ALL ON TABLE "public"."challenge_stakeholders" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_stakeholders" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_status_history" TO "anon";
GRANT ALL ON TABLE "public"."challenge_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."challenges" TO "anon";
GRANT ALL ON TABLE "public"."challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."challenges" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."department_goals" TO "anon";
GRANT ALL ON TABLE "public"."department_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."department_goals" TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";



GRANT ALL ON TABLE "public"."domains" TO "anon";
GRANT ALL ON TABLE "public"."domains" TO "authenticated";
GRANT ALL ON TABLE "public"."domains" TO "service_role";



GRANT ALL ON TABLE "public"."email_batches" TO "anon";
GRANT ALL ON TABLE "public"."email_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."email_batches" TO "service_role";



GRANT ALL ON TABLE "public"."endorsement_requests" TO "anon";
GRANT ALL ON TABLE "public"."endorsement_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."endorsement_requests" TO "service_role";



GRANT ALL ON TABLE "public"."integration_partners" TO "anon";
GRANT ALL ON TABLE "public"."integration_partners" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_partners" TO "service_role";



GRANT ALL ON TABLE "public"."investors" TO "anon";
GRANT ALL ON TABLE "public"."investors" TO "authenticated";
GRANT ALL ON TABLE "public"."investors" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."milestone_subtasks" TO "anon";
GRANT ALL ON TABLE "public"."milestone_subtasks" TO "authenticated";
GRANT ALL ON TABLE "public"."milestone_subtasks" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_performance" TO "anon";
GRANT ALL ON TABLE "public"."monthly_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_performance" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."org_module_settings" TO "anon";
GRANT ALL ON TABLE "public"."org_module_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."org_module_settings" TO "service_role";



GRANT ALL ON TABLE "public"."password_reset_requests" TO "anon";
GRANT ALL ON TABLE "public"."password_reset_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."password_reset_requests" TO "service_role";



GRANT ALL ON TABLE "public"."performance_weights" TO "anon";
GRANT ALL ON TABLE "public"."performance_weights" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_weights" TO "service_role";



GRANT ALL ON TABLE "public"."sent_emails" TO "anon";
GRANT ALL ON TABLE "public"."sent_emails" TO "authenticated";
GRANT ALL ON TABLE "public"."sent_emails" TO "service_role";



GRANT ALL ON TABLE "public"."session_edit_history" TO "anon";
GRANT ALL ON TABLE "public"."session_edit_history" TO "authenticated";
GRANT ALL ON TABLE "public"."session_edit_history" TO "service_role";



GRANT ALL ON TABLE "public"."session_links" TO "anon";
GRANT ALL ON TABLE "public"."session_links" TO "authenticated";
GRANT ALL ON TABLE "public"."session_links" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON TABLE "public"."strategic_goal_parents" TO "anon";
GRANT ALL ON TABLE "public"."strategic_goal_parents" TO "authenticated";
GRANT ALL ON TABLE "public"."strategic_goal_parents" TO "service_role";



GRANT ALL ON TABLE "public"."strategic_goals" TO "anon";
GRANT ALL ON TABLE "public"."strategic_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."strategic_goals" TO "service_role";



GRANT ALL ON TABLE "public"."sub_domains" TO "anon";
GRANT ALL ON TABLE "public"."sub_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."sub_domains" TO "service_role";



GRANT ALL ON TABLE "public"."survey_answers" TO "anon";
GRANT ALL ON TABLE "public"."survey_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_answers" TO "service_role";



GRANT ALL ON TABLE "public"."survey_distributions" TO "anon";
GRANT ALL ON TABLE "public"."survey_distributions" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_distributions" TO "service_role";



GRANT ALL ON TABLE "public"."survey_questions" TO "anon";
GRANT ALL ON TABLE "public"."survey_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_questions" TO "service_role";



GRANT ALL ON TABLE "public"."survey_responses" TO "anon";
GRANT ALL ON TABLE "public"."survey_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_responses" TO "service_role";



GRANT ALL ON TABLE "public"."survey_tokens" TO "anon";
GRANT ALL ON TABLE "public"."survey_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."surveys" TO "anon";
GRANT ALL ON TABLE "public"."surveys" TO "authenticated";
GRANT ALL ON TABLE "public"."surveys" TO "service_role";



GRANT ALL ON TABLE "public"."task_challenges" TO "anon";
GRANT ALL ON TABLE "public"."task_challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."task_challenges" TO "service_role";



GRANT ALL ON TABLE "public"."task_force_borrows" TO "anon";
GRANT ALL ON TABLE "public"."task_force_borrows" TO "authenticated";
GRANT ALL ON TABLE "public"."task_force_borrows" TO "service_role";



GRANT ALL ON TABLE "public"."task_force_requests" TO "anon";
GRANT ALL ON TABLE "public"."task_force_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."task_force_requests" TO "service_role";



GRANT ALL ON TABLE "public"."task_goals" TO "anon";
GRANT ALL ON TABLE "public"."task_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."task_goals" TO "service_role";



GRANT ALL ON TABLE "public"."task_milestones" TO "anon";
GRANT ALL ON TABLE "public"."task_milestones" TO "authenticated";
GRANT ALL ON TABLE "public"."task_milestones" TO "service_role";



GRANT ALL ON TABLE "public"."task_status_history" TO "anon";
GRANT ALL ON TABLE "public"."task_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."task_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."transfer_requests" TO "anon";
GRANT ALL ON TABLE "public"."transfer_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."transfer_requests" TO "service_role";



GRANT ALL ON TABLE "public"."user_domains" TO "anon";
GRANT ALL ON TABLE "public"."user_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."user_domains" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."vacation_requests" TO "anon";
GRANT ALL ON TABLE "public"."vacation_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."vacation_requests" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."webhook_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_subscriptions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







