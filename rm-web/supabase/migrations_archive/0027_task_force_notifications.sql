-- =====================================================================
-- 0027  TASK FORCE notifications (mirrors the 0024 emit pattern)
-- request -> Admin 1 ; borrow -> lending admin ; rejected/active -> lead
-- =====================================================================

create or replace function public.notify_task_force_request()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_notify_task_force_request on public.task_force_requests;
create trigger trg_notify_task_force_request
after insert on public.task_force_requests
for each row execute function public.notify_task_force_request();

create or replace function public.notify_task_force_status()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_notify_task_force_status on public.task_force_requests;
create trigger trg_notify_task_force_status
after update of status on public.task_force_requests
for each row execute function public.notify_task_force_status();

create or replace function public.notify_task_force_borrow()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_notify_task_force_borrow on public.task_force_borrows;
create trigger trg_notify_task_force_borrow
after insert on public.task_force_borrows
for each row execute function public.notify_task_force_borrow();
