-- =====================================================================
-- 0021  user <-> department SYNC (triggers)
-- rm/arm follow their admin; admin set explicitly by super; super = null.
-- Moving an admin's department cascades to their team. Centralized in DB.
-- =====================================================================

-- 1. derive department on insert / role change / admin change
create or replace function public.sync_user_department()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.role in ('rm','arm') then
    NEW.department_id := (select u.department_id from public.users u where u.id = NEW.admin_id);
  elsif NEW.role = 'super_admin' then
    NEW.department_id := null;
  end if;
  -- role = admin: keep NEW.department_id as provided (super assigns it)
  return NEW;
end $$;

drop trigger if exists trg_sync_user_department on public.users;
create trigger trg_sync_user_department
before insert or update of admin_id, role, department_id on public.users
for each row execute function public.sync_user_department();

-- 2. when an admin's department changes, their team follows
create or replace function public.cascade_admin_department()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.role = 'admin' and NEW.department_id is distinct from OLD.department_id then
    update public.users
       set department_id = NEW.department_id, updated_at = now()
     where admin_id = NEW.id and role in ('rm','arm') and deleted_at is null;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_cascade_admin_department on public.users;
create trigger trg_cascade_admin_department
after update of department_id on public.users
for each row execute function public.cascade_admin_department();
