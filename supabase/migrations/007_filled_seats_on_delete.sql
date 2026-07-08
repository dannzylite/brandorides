-- =====================================================================
-- BrandoRides — Fix filled_seats not decrementing on cancellation
-- =====================================================================
-- 001's trigger only fired on INSERT OR UPDATE, so cancelling a booking
-- (deleting a ride_passengers row, added in 005) never decremented
-- rides.filled_seats — leaving it permanently stale after any
-- cancellation. Rewritten to handle all three operations; DELETE has no
-- NEW row, so the function and trigger both need to reference OLD too.

CREATE OR REPLACE FUNCTION update_ride_filled_seats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_ride_id UUID := COALESCE(NEW.ride_id, OLD.ride_id);
BEGIN
  UPDATE rides
  SET filled_seats = (
    SELECT COUNT(*) FROM ride_passengers WHERE ride_id = target_ride_id
  )
  WHERE id = target_ride_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER trg_update_ride_filled_seats ON ride_passengers;

CREATE TRIGGER trg_update_ride_filled_seats
  AFTER INSERT OR UPDATE OR DELETE ON ride_passengers
  FOR EACH ROW
  EXECUTE FUNCTION update_ride_filled_seats();
