-- TECH SUPPORT — structured bug reports.
--
-- Requests flow from the deputyship's staff UP to the platform owner (the
-- can_manage_modules capability holder), not to the deputyship's own admins.
-- This is the vendor support channel, and it is where the future SaaS layer
-- will plug in.
--
-- Closure is FINAL: the owner replies once and closes. A still-stuck user files
-- a new request. Threading belongs to the Chat module, not here.

CREATE TABLE IF NOT EXISTS "public"."support_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
    REFERENCES public.organizations(id),
  "requester_id" uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- the structured questions
  "module_key" text NOT NULL,          -- which module (pre-filled from the page they were on)
  "activity" text NOT NULL,            -- what they were doing (generic list)
  "problem" text NOT NULL,             -- what happened
  "details" text NOT NULL DEFAULT '',  -- their own words / the 'Other' box

  -- captured automatically — the user should not have to describe their setup
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,  -- page, role, department, browser, language, screen

  "attachment_path" text,              -- optional screenshot in the private attachments bucket

  "status" text NOT NULL DEFAULT 'open',
  "response" text,                     -- the owner's closing reply
  "closed_by_id" uuid REFERENCES public.users(id),
  "closed_at" timestamptz,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,

  CONSTRAINT support_requests_status_check CHECK (status IN ('open', 'closed'))
);

CREATE INDEX IF NOT EXISTS support_requests_requester_idx ON public.support_requests(requester_id);
CREATE INDEX IF NOT EXISTS support_requests_status_idx ON public.support_requests(status);

ALTER TABLE "public"."support_requests" ENABLE ROW LEVEL SECURITY;

-- A user reads their OWN requests. The platform owner reads everything.
CREATE POLICY support_requests_read ON public.support_requests
  FOR SELECT
  USING (
    organization_id = current_user_organization_id()
    AND (
      requester_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.can_manage_modules = true
      )
    )
  );

-- Anyone authenticated may file a request — for themselves only.
CREATE POLICY support_requests_insert ON public.support_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND requester_id = auth.uid()
    AND organization_id = current_user_organization_id()
  );

-- Only the platform owner closes/answers a request.
CREATE POLICY support_requests_owner_update ON public.support_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.can_manage_modules = true
    )
  );

-- Notify the platform owner of a new request, and the requester when it closes.
CREATE OR REPLACE FUNCTION public.notify_support_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_requester_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id INTO v_owner FROM public.users
      WHERE can_manage_modules = true AND is_active = true
      LIMIT 1;
    SELECT name INTO v_requester_name FROM public.users WHERE id = NEW.requester_id;

    IF v_owner IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, organization_id, type, read, title, title_ar, message, message_ar,
         related_entity_type, related_entity_id, source_metadata)
      VALUES (v_owner, NEW.organization_id, 'info', false,
        'New support request', 'طلب دعم فني جديد',
        coalesce(v_requester_name, 'A user') || ' reported an issue in: ' || NEW.module_key,
        'تم الإبلاغ عن مشكلة في: ' || NEW.module_key,
        'support', NEW.id,
        jsonb_build_object('event', 'support_request_created'));
    END IF;

  ELSIF TG_OP = 'UPDATE'
        AND NEW.status = 'closed'
        AND OLD.status IS DISTINCT FROM 'closed' THEN
    INSERT INTO public.notifications
      (user_id, organization_id, type, read, title, title_ar, message, message_ar,
       related_entity_type, related_entity_id, source_metadata)
    VALUES (NEW.requester_id, NEW.organization_id, 'success', false,
      'Support request answered', 'تم الرد على طلب الدعم',
      coalesce(NEW.response, 'Your support request has been closed.'),
      coalesce(NEW.response, 'تم إغلاق طلب الدعم الخاص بك.'),
      'support', NEW.id,
      jsonb_build_object('event', 'support_request_closed'));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_support_request ON public.support_requests;
CREATE TRIGGER trg_notify_support_request
  AFTER INSERT OR UPDATE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_support_request();
