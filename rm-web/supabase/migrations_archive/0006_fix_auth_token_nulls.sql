-- =============================================================================
-- 0006: Fix NULL token columns in auth.users
-- =============================================================================
-- Supabase's GoTrue (Auth) service crashes with "Database error querying
-- schema" when columns confirmation_token, recovery_token, etc. are NULL.
-- Our 0004_seed.sql inserted them as NULL (the column allows it), but GoTrue's
-- Go code expects empty strings. This migration normalizes them.
--
-- It is idempotent: running it multiple times has no further effect.
-- Run it AFTER 0004_seed.sql on any new project.
-- =============================================================================

update auth.users
set
  confirmation_token         = coalesce(confirmation_token,         ''),
  recovery_token             = coalesce(recovery_token,             ''),
  email_change_token_new     = coalesce(email_change_token_new,     ''),
  email_change               = coalesce(email_change,               ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  reauthentication_token     = coalesce(reauthentication_token,     ''),
  phone_change               = coalesce(phone_change,               ''),
  phone_change_token         = coalesce(phone_change_token,         '')
where
     confirmation_token         is null
  or recovery_token             is null
  or email_change_token_new     is null
  or email_change               is null
  or email_change_token_current is null
  or reauthentication_token     is null
  or phone_change               is null
  or phone_change_token         is null;
