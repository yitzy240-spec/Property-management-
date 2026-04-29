-- Routing confidence tracking for bills.
-- Values:
--   'verified'   — PDF account number + utility type matched the label, OR
--                  the PDF address matched the label property's address.
--   'label_only' — only signal was the Gmail label (no PDF cross-check).
--   'mismatch'   — PDF account number resolved to a *different* property
--                  than the Gmail label; bill is flagged for manual routing.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS routing_confidence TEXT;

-- Constrain to known values (additive — null is allowed for legacy rows).
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_routing_confidence_check;
ALTER TABLE bills ADD CONSTRAINT bills_routing_confidence_check
  CHECK (routing_confidence IS NULL OR routing_confidence IN ('verified', 'label_only', 'mismatch'));

-- Speeds up the admin "needs manual routing review" queue.
CREATE INDEX IF NOT EXISTS bills_routing_confidence_idx
  ON bills (routing_confidence)
  WHERE routing_confidence IS NOT NULL;
