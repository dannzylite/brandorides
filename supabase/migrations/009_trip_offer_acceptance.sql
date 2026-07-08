-- =====================================================================
-- BrandoRides — Trip Offer Acceptance
-- =====================================================================
-- 001-005 never gave drivers any write path for trip_offers or rides,
-- and a driver with a pending, unaccepted offer couldn't even SELECT
-- the ride or its passengers (existing "assigned rides" policies key
-- off driver_id = auth.uid(), which is still NULL before acceptance).

-- Let an offered driver see the ride and its passengers before accepting.
CREATE POLICY "Drivers can view rides they have an offer for" ON rides FOR SELECT
  USING (EXISTS (SELECT 1 FROM trip_offers o WHERE o.ride_id = rides.id AND o.driver_id = auth.uid()));

CREATE POLICY "Drivers can view passengers on offered rides" ON ride_passengers FOR SELECT
  USING (EXISTS (SELECT 1 FROM trip_offers o WHERE o.ride_id = ride_passengers.ride_id AND o.driver_id = auth.uid()));

-- Decline-only: WITH CHECK makes a plain client UPDATE ... SET
-- status='accepted' structurally impossible. Acceptance must go through
-- accept_trip_offer() below, which atomically claims the ride.
CREATE POLICY "Drivers can decline own pending offers" ON trip_offers FOR UPDATE
  USING (driver_id = auth.uid() AND status = 'pending')
  WITH CHECK (driver_id = auth.uid() AND status = 'declined');

-- Race-condition-safe acceptance: the UPDATE ... WHERE driver_id IS NULL
-- guard means Postgres's row locking naturally serializes concurrent
-- callers — whoever's UPDATE actually matches a row wins; the loser's
-- affects 0 rows, which is the signal returned to the client.
CREATE OR REPLACE FUNCTION accept_trip_offer(p_offer_id UUID)
RETURNS TABLE(success BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer trip_offers;
  v_rows_updated INT;
BEGIN
  SELECT * INTO v_offer FROM trip_offers WHERE id = p_offer_id;

  IF v_offer IS NULL THEN
    RETURN QUERY SELECT FALSE, 'not_found'::TEXT; RETURN;
  END IF;
  IF v_offer.driver_id <> auth.uid() THEN
    RETURN QUERY SELECT FALSE, 'not_your_offer'::TEXT; RETURN;
  END IF;
  IF v_offer.status <> 'pending' THEN
    RETURN QUERY SELECT FALSE, 'offer_not_pending'::TEXT; RETURN;
  END IF;
  IF v_offer.expires_at < NOW() THEN
    UPDATE trip_offers SET status = 'expired' WHERE id = p_offer_id AND status = 'pending';
    RETURN QUERY SELECT FALSE, 'offer_expired'::TEXT; RETURN;
  END IF;

  UPDATE rides
  SET driver_id = auth.uid(), status = 'confirmed'
  WHERE id = v_offer.ride_id AND driver_id IS NULL AND status = 'pending_driver';
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    UPDATE trip_offers SET status = 'expired', responded_at = NOW() WHERE id = p_offer_id AND status = 'pending';
    RETURN QUERY SELECT FALSE, 'ride_already_claimed'::TEXT; RETURN;
  END IF;

  UPDATE trip_offers SET status = 'accepted', responded_at = NOW() WHERE id = p_offer_id;

  -- Every other pending offer for this ride is now moot.
  UPDATE trip_offers SET status = 'expired', responded_at = NOW()
  WHERE ride_id = v_offer.ride_id AND id <> p_offer_id AND status = 'pending';

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;
