-- =====================================================================
-- BrandoRides — Cancel Booking Cleanup
-- =====================================================================
-- store/rideStore.ts's cancelBooking() only ever deleted the student's
-- own ride_passengers row. It never touched the underlying `rides` row
-- or any trip_offers for it — so a student cancelling the last (or only)
-- passenger on a ride left it dangling: still 'pending_driver' (or worse,
-- already 'confirmed' with a driver assigned) with zero actual
-- passengers, and any pending/accepted trip_offers still showing to
-- drivers as if the trip were real.
--
-- SECURITY DEFINER because students have no UPDATE policy on `rides` or
-- `trip_offers` at all — cancellation-triggered cleanup must bypass RLS
-- to fix up both tables atomically alongside the passenger delete.
CREATE OR REPLACE FUNCTION cancel_booking(p_passenger_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride_id UUID;
  v_student_id UUID;
  v_remaining_seats INT;
BEGIN
  SELECT ride_id, student_id INTO v_ride_id, v_student_id
  FROM ride_passengers WHERE id = p_passenger_id;

  IF v_ride_id IS NULL THEN
    RETURN; -- already gone, nothing to do
  END IF;
  IF v_student_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your booking';
  END IF;

  DELETE FROM ride_passengers WHERE id = p_passenger_id;
  -- trg_update_ride_filled_seats (007) fires here and recalculates filled_seats.

  SELECT filled_seats INTO v_remaining_seats FROM rides WHERE id = v_ride_id;

  IF v_remaining_seats = 0 THEN
    UPDATE rides SET status = 'cancelled' WHERE id = v_ride_id;
    -- Resolves both not-yet-answered AND already-accepted offers — a
    -- driver who'd already accepted needs this ride to disappear from
    -- their upcoming trips too, not just unanswered offers.
    UPDATE trip_offers SET status = 'cancelled', responded_at = NOW()
    WHERE ride_id = v_ride_id AND status IN ('pending', 'accepted');
  END IF;
END;
$$;
