-- =====================================================================
-- BrandoRides — Stop re-broadcasting rides whose flight already happened
-- =====================================================================
-- rebroadcast_stale_ride_offers() (013) had no floor on departure_date —
-- it would (and, confirmed live, did) re-offer a ride to drivers for a
-- flight that already departed the day before. Re-offering a dead ride
-- is actively wrong, not just unhelpful: a driver could accept a pickup
-- for a flight that already landed. Once the flight's day has passed
-- with no driver ever assigned, the ride is done — no more re-broadcasts.
-- The student-facing "delete this expired trip" action (app-side) is
-- what actually resolves it via the existing cancel_booking() (010).
CREATE OR REPLACE FUNCTION rebroadcast_stale_ride_offers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride RECORD;
  v_driver RECORD;
  v_required_capacity INT;
BEGIN
  FOR v_ride IN
    SELECT r.* FROM rides r
    WHERE r.status = 'pending_driver'
      AND r.driver_id IS NULL
      AND r.departure_date >= CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM trip_offers o
        WHERE o.ride_id = r.id AND o.status = 'pending' AND o.expires_at > NOW()
      )
  LOOP
    v_required_capacity := vehicle_class_max_luggage(v_ride.vehicle_class_required);

    FOR v_driver IN
      SELECT id FROM driver_profiles
      WHERE is_approved = TRUE
        AND max_passengers >= v_ride.total_seats
        AND max_luggage_units >= v_required_capacity
        AND check_driver_available(id, v_ride.departure_date)
    LOOP
      INSERT INTO trip_offers (ride_id, driver_id, status, offered_at, responded_at, expires_at)
      VALUES (v_ride.id, v_driver.id, 'pending', NOW(), NULL, NOW() + INTERVAL '60 minutes')
      ON CONFLICT (ride_id, driver_id) DO UPDATE
        SET status = 'pending', offered_at = NOW(), responded_at = NULL, expires_at = NOW() + INTERVAL '60 minutes';
    END LOOP;
  END LOOP;
END;
$$;
