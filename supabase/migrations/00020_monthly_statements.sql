-- ApartmentOS: Monthly billing statements & payment tracking
-- Supports: statement generation, Green Invoice proforma/receipt linking, payment recording

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE statement_status AS ENUM ('draft', 'sent', 'partially_paid', 'paid', 'overdue');
CREATE TYPE statement_direction AS ENUM ('owner_owes', 'marcus_owes', 'zero');

-- ============================================
-- MONTHLY STATEMENTS
-- ============================================

CREATE TABLE monthly_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  billing_month DATE NOT NULL,                    -- First of month, e.g. '2026-04-01'
  status statement_status NOT NULL DEFAULT 'draft',
  direction statement_direction NOT NULL,

  -- Aggregated amounts (all in agorot)
  gross_rental_agorot INTEGER NOT NULL DEFAULT 0,
  commission_agorot INTEGER NOT NULL DEFAULT 0,
  hourly_charges_agorot INTEGER NOT NULL DEFAULT 0,
  fixed_fee_agorot INTEGER NOT NULL DEFAULT 0,
  bills_paid_agorot INTEGER NOT NULL DEFAULT 0,   -- Bills admin paid on owner's behalf
  cc_surcharge_agorot INTEGER NOT NULL DEFAULT 0,  -- 3.5% CC fee if applicable
  net_amount_agorot INTEGER NOT NULL DEFAULT 0,    -- Positive = owner owes, negative = Marcus owes

  -- Line item breakdown stored as JSON for display
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Green Invoice references
  gi_proforma_id TEXT,                             -- Type 300 document ID
  gi_proforma_number INTEGER,                      -- Human-readable doc number
  gi_proforma_url TEXT,                            -- Hosted payment page URL
  gi_receipt_id TEXT,                               -- Type 400 receipt after payment
  gi_receipt_number INTEGER,

  -- Payment tracking
  amount_paid_agorot INTEGER NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  payment_method TEXT,                             -- bank_transfer, credit_card, cash
  payment_reference TEXT,                          -- Check #, transfer ref, etc.

  -- Notifications
  reminder_sent_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,                             -- When statement was emailed to owner

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(owner_id, billing_month)
);

-- ============================================
-- STATEMENT LINE ITEMS (for audit trail)
-- ============================================

CREATE TABLE statement_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES monthly_statements(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  category TEXT NOT NULL,          -- 'rental_income', 'commission', 'hourly', 'fixed_fee', 'bill_expense', 'cc_surcharge'
  description TEXT NOT NULL,
  amount_agorot INTEGER NOT NULL,  -- Positive = charge to owner, negative = credit
  source_id UUID,                  -- FK to booking/task/bill that generated this
  source_type TEXT,                -- 'booking', 'work_log', 'bill', 'property'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- STATEMENT PAYMENTS (supports partial payments)
-- ============================================

CREATE TABLE statement_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES monthly_statements(id) ON DELETE CASCADE,
  amount_agorot INTEGER NOT NULL,
  payment_method TEXT NOT NULL,    -- bank_transfer, credit_card, cash, check
  payment_date DATE NOT NULL,
  reference TEXT,                  -- Transfer ref, check number, etc.
  gi_receipt_id TEXT,              -- Green Invoice receipt doc ID
  gi_receipt_number INTEGER,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- RLS
-- ============================================

ALTER TABLE monthly_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_payments ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access on monthly_statements" ON monthly_statements FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admin full access on statement_line_items" ON statement_line_items FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admin full access on statement_payments" ON statement_payments FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Owners see own statements
CREATE POLICY "Owners see own statements" ON monthly_statements FOR SELECT
  USING (owner_id IN (SELECT id FROM owners WHERE auth_user_id = auth.uid()));

CREATE POLICY "Owners see own statement line items" ON statement_line_items FOR SELECT
  USING (statement_id IN (
    SELECT ms.id FROM monthly_statements ms
    JOIN owners o ON ms.owner_id = o.id
    WHERE o.auth_user_id = auth.uid()
  ));

CREATE POLICY "Owners see own statement payments" ON statement_payments FOR SELECT
  USING (statement_id IN (
    SELECT ms.id FROM monthly_statements ms
    JOIN owners o ON ms.owner_id = o.id
    WHERE o.auth_user_id = auth.uid()
  ));

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_statements_owner ON monthly_statements(owner_id);
CREATE INDEX idx_statements_month ON monthly_statements(billing_month);
CREATE INDEX idx_statements_status ON monthly_statements(status);
CREATE INDEX idx_statement_line_items_statement ON statement_line_items(statement_id);
CREATE INDEX idx_statement_payments_statement ON statement_payments(statement_id);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER set_updated_at BEFORE UPDATE ON monthly_statements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
