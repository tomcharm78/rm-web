alter table public.users
  add column if not exists is_higher_management boolean not null default false;
