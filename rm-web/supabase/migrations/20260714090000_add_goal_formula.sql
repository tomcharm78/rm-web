-- KPI scorecard: the measurement equation (معادلة القياس).
--
-- This is the only field the scorecard needed that we did not already have.
-- The other blanks are resolved without schema:
--   • مصدر البيانات (data source)  -> the organisation's own name (already known)
--   • رمز المؤشر  (KPI code)       -> DERIVED as DD-KK, where DD is the
--     department's ordinal by creation order and KK is the goal's ordinal
--     within that department, also by creation order.
--
-- The formula is a single field (not bilingual): it is mathematical notation
-- more than prose, so an _ar variant would just be duplicated symbols.

ALTER TABLE "public"."department_goals"
  ADD COLUMN IF NOT EXISTS "formula" "text" DEFAULT ''::"text" NOT NULL;

COMMENT ON COLUMN "public"."department_goals"."formula" IS
  'Measurement equation shown on the KPI scorecard (معادلة القياس). Single field — notation, not prose.';
