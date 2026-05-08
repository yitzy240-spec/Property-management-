-- The Pub/Sub webhook uses a SELECT-then-INSERT dedup pattern that
-- isn't atomic — when Pub/Sub redelivers the same message (it's
-- at-least-once by design) two concurrent webhook invocations can
-- both see "no existing row" and both insert, producing duplicate
-- bill rows for one Gmail message. Five duplicates already showed
-- up in the pending queue from one bill cycle.
--
-- The DB itself can enforce uniqueness — once this constraint is in
-- place, the second insert fails (unique violation) and the first
-- one wins. The webhook code can then keep its current control flow
-- and the dedup is bulletproof regardless of races.
--
-- Manually-added bills have NULL gmail_message_id and Postgres
-- treats multiple NULLs in a UNIQUE column as distinct, so the
-- constraint doesn't break the manual-add path.
CREATE UNIQUE INDEX IF NOT EXISTS bills_gmail_message_id_unique
  ON bills (gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;
