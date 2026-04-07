-- Payment method tracking for bills
-- Values: paid_by_owner_cash, paid_by_owner_cc, paid_by_admin, null (not yet paid)
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_method TEXT;
