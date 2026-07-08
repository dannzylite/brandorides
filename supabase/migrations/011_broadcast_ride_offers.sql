-- =====================================================================
-- BrandoRides — Automated Offer Broadcasting
-- =====================================================================
-- Nothing previously created trip_offers automatically — every offer in
-- this system so far was inserted by hand for testing. This trigger
-- fires whenever a new unassigned ride is created and broadcasts a
-- pending offer to every eligible driver at once (approved, available
-- that day per check_driver_available() from 008, vehicle big enough).
-- First driver to accept wins — accept_trip_offer() (009) already
-- handles that race safely and expires the other offers on success.
--
-- Scope note: this does NOT implement the tiered/staggered rollout by
-- driver rating that TIMING's offer_rating_delay_tier1/2/3_minutes
-- suggest was originally envisioned — that needs a recurring background
-- job (a scheduled function repeatedly widening the pool), not just an
-- INSERT trigger. Broadcasting to every eligible driver simultaneously
-- is the deliberate MVP scope here.
CREATE OR REPLACE FUNCTION broadcast_ride_offers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required_capacity INT := vehicle_class_max_luggage(NEW.vehicle_class_required);
  v_driver RECORD;
BEGIN
  FOR v_driver IN
    SELECT id FROM driver_profiles
    WHERE is_approved = TRUE
      AND max_passengers >= NEW.total_seats
      AND max_luggage_units >= v_required_capacity
      AND check_driver_available(id, NEW.departure_date)
  LOOP
    INSERT INTO trip_offers (ride_id, driver_id, expires_at)
    VALUES (NEW.id, v_driver.id, NOW() + INTERVAL '60 minutes')
    ON CONFLICT (ride_id, driver_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_broadcast_ride_offers
  AFTER INSERT ON rides
  FOR EACH ROW
  WHEN (NEW.status = 'pending_driver')
  EXECUTE FUNCTION broadcast_ride_offers();
