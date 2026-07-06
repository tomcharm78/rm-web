-- =====================================================================
-- 0051  VACATIONS — notification triggers + archiving
--
-- Triggers (SECURITY DEFINER, matching notify_task_* pattern from 0024):
--   A. on INSERT of a pending request → notify the requester's DIRECT
--      MANAGER (users.admin_id).
--   B. on UPDATE to approved  → notify the requester.
--   C. on UPDATE to rejected  → notify the requester (with reason).
--
-- Plus: archived_at column so managers/super can archive old requests
-- out of the active list (soft-hide, like challenges.archived_at).
--
-- Run BLOCK BY BLOCK single-line in the Supabase SQL editor.
-- =====================================================================


-- ---- BLOCK 1: archived_at column ----
alter table public.vacation_requests add column if not exists archived_at timestamptz;


-- ---- BLOCK 2: notify manager on new request (INSERT) ----
create or replace function public.notify_vacation_request() returns trigger language plpgsql security definer set search_path to 'public' as $function$ declare v_mgr uuid; begin select admin_id into v_mgr from public.users where id = NEW.user_id; if v_mgr is not null and v_mgr is distinct from NEW.user_id then insert into public.notifications (user_id, organization_id, type, read, title, title_ar, message, message_ar, related_entity_type, related_entity_id, source_metadata) values (v_mgr, NEW.organization_id, 'info', false, 'Leave request pending', 'طلب إجازة بانتظار الموافقة', 'A leave request needs your approval.', 'يوجد طلب إجازة بحاجة إلى موافقتك.', 'vacation', NEW.id, jsonb_build_object('event','vacation_requested','actorId',NEW.user_id)); end if; return NEW; end; $function$;


-- ---- BLOCK 3: notify requester on approve/reject (UPDATE) ----
create or replace function public.notify_vacation_decision() returns trigger language plpgsql security definer set search_path to 'public' as $function$ declare v_actor uuid := auth.uid(); begin if NEW.status is distinct from OLD.status and NEW.status = 'approved' then insert into public.notifications (user_id, organization_id, type, read, title, title_ar, message, message_ar, related_entity_type, related_entity_id, source_metadata) values (NEW.user_id, NEW.organization_id, 'success', false, 'Leave approved', 'تمت الموافقة على الإجازة', 'Your leave request was approved.', 'تمت الموافقة على طلب إجازتك.', 'vacation', NEW.id, jsonb_build_object('event','vacation_approved','actorId',v_actor)); elsif NEW.status is distinct from OLD.status and NEW.status = 'rejected' then insert into public.notifications (user_id, organization_id, type, read, title, title_ar, message, message_ar, related_entity_type, related_entity_id, source_metadata) values (NEW.user_id, NEW.organization_id, 'error', false, 'Leave rejected', 'تم رفض الإجازة', 'Your leave request was rejected: ' || coalesce(NEW.rejection_reason,''), 'تم رفض طلب إجازتك: ' || coalesce(NEW.rejection_reason,''), 'vacation', NEW.id, jsonb_build_object('event','vacation_rejected','actorId',v_actor)); end if; return NEW; end; $function$;


-- ---- BLOCK 4: attach insert trigger ----
drop trigger if exists trg_notify_vacation_request on public.vacation_requests;
create trigger trg_notify_vacation_request after insert on public.vacation_requests for each row execute function public.notify_vacation_request();


-- ---- BLOCK 5: attach update trigger ----
drop trigger if exists trg_notify_vacation_decision on public.vacation_requests;
create trigger trg_notify_vacation_decision after update on public.vacation_requests for each row execute function public.notify_vacation_decision();


-- ---- BLOCK 6: schema cache reload ----
notify pgrst, 'reload schema';
