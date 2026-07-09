-- =====================================================================
-- 0024  Notification emit triggers (Notifications, Scope B)
-- Writes into the EXISTING notifications table (Rork stub).
-- type = severity; event key + actor stored in source_metadata.
-- SECURITY DEFINER (owned by postgres) bypasses the insert policy,
-- same pattern as the dept-sync triggers. Recipients via joins.
-- =====================================================================

-- 1) SUBTASK SUPPORT: requested -> owner ; accepted/declined -> task assignee (RM)
create or replace function public.notify_subtask_support()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_notify_subtask_support on public.milestone_subtasks;
create trigger trg_notify_subtask_support
after insert or update of support_status on public.milestone_subtasks
for each row execute function public.notify_subtask_support();

-- 2) TASK ASSIGNED -> assignee
create or replace function public.notify_task_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_notify_task_assignment on public.tasks;
create trigger trg_notify_task_assignment
after insert or update of assigned_to_id on public.tasks
for each row execute function public.notify_task_assignment();

-- 3) TASK LIFECYCLE: closure submitted -> admin ; rejected/approved -> assignee ; declined -> admin
create or replace function public.notify_task_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_notify_task_lifecycle on public.tasks;
create trigger trg_notify_task_lifecycle
after update of closure_requested_at, closure_rejected_at, declined_at, status on public.tasks
for each row execute function public.notify_task_lifecycle();
