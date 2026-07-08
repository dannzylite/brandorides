-- =====================================================================
-- BrandoRides — Re-broadcast offers for rides nobody accepted in time
-- =====================================================================
-- broadcast_ride_offers() (011) only fires once, on ride INSERT. If every
-- driver offered at that moment lets their offer expire without
-- responding, the ride is permanently stuck: pending_driver, driver_id
-- NULL, zero active offers, nothing ever looks at it again. Confirmed
-- live on a real test ride (both drivers' offers expired, ride never
-- re-offered). This closes that gap with a recurring job rather than a
-- one-shot trigger, since "nobody accepted within the window" can only
-- be known after the window has passed.
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
      -- UNIQUE(ride_id, driver_id) means a driver already offered this ride
      -- once (now expired/declined, guaranteed by the outer NOT EXISTS) has
      -- an existing row — reuse it instead of inserting a second one.
      INSERT INTO trip_offers (ride_id, driver_id, status, offered_at, responded_at, expires_at)
      VALUES (v_ride.id, v_driver.id, 'pending', NOW(), NULL, NOW() + INTERVAL '60 minutes')
      ON CONFLICT (ride_id, driver_id) DO UPDATE
        SET status = 'pending', offered_at = NOW(), responded_at = NULL, expires_at = NOW() + INTERVAL '60 minutes';
    END LOOP;
  END LOOP;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'rebroadcast-stale-ride-offers',
  '*/5 * * * *',
  $$SELECT rebroadcast_stale_ride_offers();$$
);
