-- ============================================================================
-- Migration 0052 — APPROVALS MODULE (Phase 1: letter/proposal request flow)
-- Run BLOCK BY BLOCK in the Supabase SQL editor. Each statement is single-line
-- (the editor mangles multi-line CREATE/POLICY). The enum CREATE runs alone.
-- ============================================================================

-- BLOCK 1 — status enum (run alone)
create type public.approval_status as enum ('pending', 'approved', 'rejected');

-- BLOCK 2 — the table (single line)
create table public.approval_requests (id uuid primary key default gen_random_uuid(), title text not null, title_ar text not null default '', description text not null default '', description_ar text not null default '', requester_id uuid not null references public.users(id), approver_id uuid not null references public.users(id), status public.approval_status not null default 'pending', decision_comment text, decided_at timestamptz, decided_by_id uuid references public.users(id), organization_id uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, archived_at timestamptz, external_id text, source_system text, source_metadata jsonb default '{}');

-- BLOCK 3 — indexes
create index approval_requests_requester_idx on public.approval_requests (requester_id) where deleted_at is null;
create index approval_requests_approver_idx on public.approval_requests (approver_id) where deleted_at is null;
create index approval_requests_status_idx on public.approval_requests (status) where deleted_at is null;

-- BLOCK 4 — enable RLS
alter table public.approval_requests enable row level security;

-- BLOCK 5 — READ: requester reads own; approver reads where they're the approver; super reads all-in-org. (single line)
create policy approval_requests_read on public.approval_requests for select using (organization_id = public.current_user_organization_id() and (requester_id = auth.uid() or approver_id = auth.uid() or public.current_user_role() = 'super_admin'));

-- BLOCK 6 — INSERT: self only, must be pending, org must match (single line)
create policy approval_requests_insert on public.approval_requests for insert with check (organization_id = public.current_user_organization_id() and requester_id = auth.uid() and status = 'pending');

-- BLOCK 7 — UPDATE (decide): only the named approver or a super, and only in same org (single line)
create policy approval_requests_update on public.approval_requests for update using (organization_id = public.current_user_organization_id() and (approver_id = auth.uid() or public.current_user_role() = 'super_admin'));

-- BLOCK 8 — notify the chosen approver on new request (single line)
create or replace function public.notify_approval_request() returns trigger language plpgsql security definer set search_path to 'public' as $function$ begin if NEW.approver_id is not null and NEW.approver_id is distinct from NEW.requester_id then insert into public.notifications (user_id, organization_id, type, read, title, title_ar, message, message_ar, related_entity_type, related_entity_id, source_metadata) values (NEW.approver_id, NEW.organization_id, 'info', false, 'Approval request pending', 'طلب موافقة بانتظار قرارك', 'A request needs your approval.', 'يوجد طلب بحاجة إلى موافقتك.', 'approval', NEW.id, jsonb_build_object('event','approval_requested','actorId',NEW.requester_id)); end if; return NEW; end; $function$;

-- BLOCK 9 — notify the initiator on decision, carrying the comment (single line)
create or replace function public.notify_approval_decision() returns trigger language plpgsql security definer set search_path to 'public' as $function$ declare v_actor uuid := auth.uid(); begin if NEW.status is distinct from OLD.status and NEW.status = 'approved' then insert into public.notifications (user_id, organization_id, type, read, title, title_ar, message, message_ar, related_entity_type, related_entity_id, source_metadata) values (NEW.requester_id, NEW.organization_id, 'success', false, 'Request approved', 'تمت الموافقة على الطلب', 'Your request was approved. ' || coalesce(NEW.decision_comment,''), 'تمت الموافقة على طلبك. ' || coalesce(NEW.decision_comment,''), 'approval', NEW.id, jsonb_build_object('event','approval_approved','actorId',v_actor)); elsif NEW.status is distinct from OLD.status and NEW.status = 'rejected' then insert into public.notifications (user_id, organization_id, type, read, title, title_ar, message, message_ar, related_entity_type, related_entity_id, source_metadata) values (NEW.requester_id, NEW.organization_id, 'error', false, 'Request rejected', 'تم رفض الطلب', 'Your request was rejected. ' || coalesce(NEW.decision_comment,''), 'تم رفض طلبك. ' || coalesce(NEW.decision_comment,''), 'approval', NEW.id, jsonb_build_object('event','approval_rejected','actorId',v_actor)); end if; return NEW; end; $function$;

-- BLOCK 10 — triggers
drop trigger if exists trg_notify_approval_request on public.approval_requests;
create trigger trg_notify_approval_request after insert on public.approval_requests for each row execute function public.notify_approval_request();
drop trigger if exists trg_notify_approval_decision on public.approval_requests;
create trigger trg_notify_approval_decision after update on public.approval_requests for each row execute function public.notify_approval_decision();

-- BLOCK 11 — reload PostgREST schema cache
notify pgrst, 'reload schema';
