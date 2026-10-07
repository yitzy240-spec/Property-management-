-- Bookings are now stored in the currency they were entered in (no conversion
-- on entry; statements convert with bookings.exchange_rate). The old booking
-- form stored USD bookings as converted ILS agorot while labelling them USD
-- (e.g. $1,000 at 3.70 saved as 370000 → displayed "$3,700").
--
-- Restore the entered USD amount for exactly those rows: form-created USD
-- bookings whose stored amount equals original × rate. Lodgify-synced USD
-- bookings (no original_amount_cents) are already in USD cents and untouched.
UPDATE bookings
SET gross_rental_agorot = original_amount_cents
WHERE currency = 'USD'
  AND original_amount_cents IS NOT NULL
  AND exchange_rate IS NOT NULL
  AND gross_rental_agorot = ROUND(original_amount_cents * exchange_rate);
