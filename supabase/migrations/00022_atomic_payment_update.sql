-- Atomic payment update to prevent race conditions on concurrent payments
CREATE OR REPLACE FUNCTION record_statement_payment(
  p_statement_id UUID,
  p_payment_amount INTEGER,
  p_surcharge_amount INTEGER DEFAULT 0,
  p_payment_method TEXT DEFAULT NULL,
  p_payment_reference TEXT DEFAULT NULL,
  p_gi_receipt_id TEXT DEFAULT NULL,
  p_gi_receipt_number INTEGER DEFAULT NULL
) RETURNS TABLE(new_paid_total INTEGER, new_status statement_status) AS $$
DECLARE
  v_net_abs INTEGER;
  v_new_paid INTEGER;
  v_new_status statement_status;
BEGIN
  -- Atomic update with row lock
  UPDATE monthly_statements
  SET
    amount_paid_agorot = COALESCE(amount_paid_agorot, 0) + p_payment_amount,
    cc_surcharge_agorot = CASE WHEN p_surcharge_amount > 0 THEN COALESCE(cc_surcharge_agorot, 0) + p_surcharge_amount ELSE COALESCE(cc_surcharge_agorot, 0) END,
    payment_method = COALESCE(p_payment_method, payment_method),
    payment_reference = COALESCE(p_payment_reference, payment_reference)
  WHERE id = p_statement_id
  RETURNING amount_paid_agorot, ABS(net_amount_agorot)
  INTO v_new_paid, v_net_abs;

  -- Determine new status
  IF v_new_paid >= v_net_abs THEN
    v_new_status := 'paid';
    UPDATE monthly_statements SET
      status = 'paid',
      paid_at = now(),
      gi_receipt_id = COALESCE(p_gi_receipt_id, gi_receipt_id),
      gi_receipt_number = COALESCE(p_gi_receipt_number, gi_receipt_number)
    WHERE id = p_statement_id;
  ELSE
    v_new_status := 'partially_paid';
    UPDATE monthly_statements SET status = 'partially_paid'
    WHERE id = p_statement_id;
  END IF;

  RETURN QUERY SELECT v_new_paid, v_new_status;
END;
$$ LANGUAGE plpgsql;
