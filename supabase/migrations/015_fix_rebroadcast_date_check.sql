-- =====================================================================
-- BrandoRides — Fix premature UTC date rollover in re-broadcast guard
-- =====================================================================
-- 014's `departure_date >= CURRENT_DATE` guard compares a bare calendar
-- date against Postgres's UTC-based CURRENT_DATE. A ride booked for the
-- evening of a given local day can have that UTC date roll over to the
-- next day hours before the flight actually lands (confirmed live: ride
-- departure_date = 2026-07-07, but CURRENT_DATE was already 2026-07-08
-- while the flight hadn't landed for another ~17 minutes) — the guard
-- would wrongly treat a still-live ride as already dead. Same class of
-- DATE-column timezone bug this project has hit before (see parseDateOnly
-- in utils/index.ts). Fixed by keying off estimated_landing (a real
-- timestamptz) instead, matching isPendingRideExpired's definition on
-- the client: dead only once the flight has actually landed + grace.
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
      AND r.estimated_landing + INTERVAL '60 minutes' > NOW()
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
