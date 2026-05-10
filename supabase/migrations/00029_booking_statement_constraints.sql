-- Two unrelated constraint changes from this morning's bug review.
--
-- 1) bookings.external_id needs to be unique. Without it, when a
--    Lodgify booking is reassigned to a different property (Ariel
--    moved Ari Sonneberg from Jerusalem Skyline to Agripas 8 inside
--    Lodgify), the next sync's existing-row lookup — scoped to
--    (property_id, external_id) — sees no match on the NEW property
--    and inserts a duplicate while the OLD row sits untouched. Same
--    Lodgify booking id, two rows, two apartments. The lookup is
--    being rewritten to search by external_id only; the unique
--    constraint enforces that invariant at the DB level.
--
-- 2) monthly_statements (owner_id, billing_month) UNIQUE blocked
--    Ariel from issuing two separate bills to the same owner in one
--    month (e.g. base fees + a one-off reimbursement). The line-items
--    model can technically express that, but he wants two distinct
--    documents (two proformas). Drop the constraint so the existing
--    monthly statement and any add-on bills can coexist. The auto-
--    generation logic stays one-per-owner-per-month; additional
--    statements only get created via explicit admin action.

CREATE UNIQUE INDEX IF NOT EXISTS bookings_external_id_unique
  ON bookings (external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE monthly_statements
  DROP CONSTRAINT IF EXISTS monthly_statements_owner_id_billing_month_key;
