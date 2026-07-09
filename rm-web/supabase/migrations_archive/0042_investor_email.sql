-- =====================================================================
-- 0042  INVESTOR EMAIL — bulk-send helper (not a mail client)
--
-- email_batches : one row per send (template stored ONCE for audit re-merge).
-- sent_emails   : one row per recipient (status sent/failed).
-- History re-merges body_template with each investor's data on view.
-- Born gated on module_key='emails' (entitlements).
--
-- Run BLOCK BY BLOCK in the Supabase SQL editor (single-line statements).
-- =====================================================================


-- ---- BLOCK 1: email_batches (single line) ----
create table if not exists public.email_batches (id uuid primary key default gen_random_uuid(), subject_template text not null, body_template text not null, cc text not null default '', reply_to text not null default '', attachment_paths jsonb not null default '[]'::jsonb, recipient_count int not null default 0, success_count int not null default 0, fail_count int not null default 0, sent_by_id uuid not null references public.users(id), organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), created_at timestamptz not null default now());


-- ---- BLOCK 2: sent_emails (single line) ----
create table if not exists public.sent_emails (id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.email_batches(id) on delete cascade, investor_id uuid references public.investors(id) on delete set null, recipient_email text not null, recipient_name text not null default '', status text not null default 'sent', error text, organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), sent_at timestamptz not null default now());


-- ---- BLOCK 3: indexes ----
create index if not exists email_batches_org_idx on public.email_batches (organization_id, created_at desc);
create index if not exists sent_emails_batch_idx on public.sent_emails (batch_id);
create index if not exists sent_emails_investor_idx on public.sent_emails (investor_id);


-- ---- BLOCK 4: enable RLS ----
alter table public.email_batches enable row level security;
alter table public.sent_emails enable row level security;


-- ---- BLOCK 5: RLS — read for any non-stakeholder org member (history stays visible read-only even if module later disabled); writes happen server-side via service role (route enforces permission + gate) ----
create policy email_batches_read on public.email_batches for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());
create policy sent_emails_read on public.sent_emails for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());
