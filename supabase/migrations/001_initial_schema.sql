-- =====================================================================
-- BrandoRides — Initial Database Schema
-- =====================================================================

-- =====================================================================
-- STEP 1: Extensions
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- STEP 2: Enums
-- =====================================================================

CREATE TYPE user_role AS ENUM ('student', 'driver', 'admin');
CREATE TYPE vehicle_class AS ENUM
  ('sedan', 'suv', 'minivan', 'truck');
CREATE TYPE ride_status AS ENUM (
  'pending_driver', 'confirmed', 'driver_en_route',
  'at_airport', 'in_progress', 'completed', 'cancelled'
);
CREATE TYPE ride_type AS ENUM ('shared', 'solo');
CREATE TYPE payment_status AS ENUM
  ('pending', 'paid', 'refunded');
CREATE TYPE student_trip_status AS ENUM (
  'booked', 'landed', 'at_arrivals', 'in_vehicle', 'completed'
);
CREATE TYPE offer_status AS ENUM (
  'pending', 'accepted', 'declined', 'expired', 'cancelled'
);
CREATE TYPE notification_channel AS ENUM
  ('push', 'sms', 'email', 'in_app');
CREATE TYPE time_preference AS ENUM
  ('morning', 'afternoon', 'flexible');

-- =====================================================================
-- STEP 3: Tables
-- =====================================================================

CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role user_role NOT NULL DEFAULT 'student',
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  avatar_url TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE driver_profiles (
  id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  license_url TEXT,
  insurance_url TEXT,
  vehicle_make TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_year INTEGER NOT NULL,
  vehicle_color TEXT NOT NULL,
  vehicle_plate TEXT NOT NULL,
  vehicle_class vehicle_class NOT NULL,
  max_passengers INTEGER NOT NULL,
  max_luggage_units INTEGER NOT NULL,
  rating DECIMAL(3,2) NOT NULL DEFAULT 5.00,
  total_trips INTEGER NOT NULL DEFAULT 0,
  stripe_account_id TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE student_profiles (
  id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  student_id_url TEXT,
  acceptance_letter_url TEXT,
  university TEXT NOT NULL DEFAULT 'Brandon University',
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE driver_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES driver_profiles(id)
    ON DELETE CASCADE,
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  is_blackout BOOLEAN NOT NULL DEFAULT FALSE,
  blackout_date DATE,
  time_preference time_preference NOT NULL DEFAULT 'flexible',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_availability CHECK (
    (is_blackout = FALSE AND day_of_week IS NOT NULL) OR
    (is_blackout = TRUE AND blackout_date IS NOT NULL)
  )
);

CREATE TABLE rides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status ride_status NOT NULL DEFAULT 'pending_driver',
  ride_type ride_type NOT NULL DEFAULT 'shared',
  departure_date DATE NOT NULL,
  flight_number TEXT NOT NULL,
  flight_origin TEXT NOT NULL,
  estimated_landing TIMESTAMPTZ NOT NULL,
  actual_landing TIMESTAMPTZ,
  driver_id UUID REFERENCES driver_profiles(id),
  vehicle_class_required vehicle_class NOT NULL,
  total_seats INTEGER NOT NULL,
  filled_seats INTEGER NOT NULL DEFAULT 0,
  base_fare_per_seat INTEGER NOT NULL,
  platform_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  driver_earnings INTEGER NOT NULL DEFAULT 0,
  wait_fee_total INTEGER NOT NULL DEFAULT 0,
  pickup_location TEXT NOT NULL DEFAULT
    'Winnipeg James Armstrong Richardson International Airport - International Arrivals Hall, Ground Level',
  dropoff_area TEXT NOT NULL,
  driver_leave_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ride_passengers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student_profiles(id),
  large_bags INTEGER NOT NULL DEFAULT 0,
  carry_ons INTEGER NOT NULL DEFAULT 0,
  oversized_items BOOLEAN NOT NULL DEFAULT FALSE,
  luggage_units INTEGER GENERATED ALWAYS AS
    (large_bags * 2 + carry_ons +
     CASE WHEN oversized_items THEN 4 ELSE 0 END) STORED,
  seat_fare INTEGER NOT NULL,
  wait_fee_charged INTEGER NOT NULL DEFAULT 0,
  payment_intent_id TEXT,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  student_status student_trip_status NOT NULL DEFAULT 'booked',
  rating_given INTEGER CHECK (rating_given BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ride_id, student_id)
);

CREATE TABLE trip_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES driver_profiles(id),
  status offer_status NOT NULL DEFAULT 'pending',
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(ride_id, driver_id)
);

CREATE TABLE notifications_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES profiles(id),
  ride_id UUID REFERENCES rides(id),
  type TEXT NOT NULL,
  channel notification_channel NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE driver_location (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES driver_profiles(id)
    ON DELETE CASCADE UNIQUE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id)
    ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token)
);

-- =====================================================================
-- STEP 4: Indexes
-- =====================================================================

CREATE INDEX idx_rides_status ON rides(status);
CREATE INDEX idx_rides_departure_date ON rides(departure_date);
CREATE INDEX idx_rides_driver_id ON rides(driver_id);
CREATE INDEX idx_ride_passengers_ride_id
  ON ride_passengers(ride_id);
CREATE INDEX idx_ride_passengers_student_id
  ON ride_passengers(student_id);
CREATE INDEX idx_trip_offers_ride_id ON trip_offers(ride_id);
CREATE INDEX idx_trip_offers_driver_id ON trip_offers(driver_id);
CREATE INDEX idx_driver_availability_driver_id
  ON driver_availability(driver_id);
CREATE INDEX idx_notifications_recipient
  ON notifications_log(recipient_id);
CREATE INDEX idx_driver_location_driver_id
  ON driver_location(driver_id);

-- =====================================================================
-- STEP 5: Row Level Security
-- =====================================================================

-- Helper: is the current auth user an admin?
-- SECURITY DEFINER + a table owned by the migration role (postgres, which
-- bypasses RLS) means this lookup does not re-trigger RLS on `profiles`,
-- so policies on `profiles` that call this do not recurse.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- profiles: users read/update their own row; admins read all
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin());

-- driver_profiles: drivers manage their own row; students can see approved
-- drivers only for rides they are booked on; admins read/update all
CREATE POLICY "Drivers can view own driver profile"
  ON driver_profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Drivers can update own driver profile"
  ON driver_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Students can view approved drivers for their rides"
  ON driver_profiles FOR SELECT
  USING (
    is_approved = TRUE
    AND EXISTS (
      SELECT 1 FROM rides r
      JOIN ride_passengers rp ON rp.ride_id = r.id
      WHERE r.driver_id = driver_profiles.id
        AND rp.student_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all driver profiles"
  ON driver_profiles FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can update all driver profiles"
  ON driver_profiles FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- student_profiles: students manage their own row; admins read all
CREATE POLICY "Students can view own student profile"
  ON student_profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Students can update own student profile"
  ON student_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can view all student profiles"
  ON student_profiles FOR SELECT
  USING (is_admin());

-- driver_availability: drivers fully manage their own rows;
-- service role (matching engine) can read all
CREATE POLICY "Drivers can manage own availability"
  ON driver_availability FOR ALL
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Service role can view all availability"
  ON driver_availability FOR SELECT
  TO service_role
  USING (true);

-- rides: students see rides they're booked on; drivers see their assigned
-- rides; admins read/update all; service role (matching/edge functions)
-- has full access
CREATE POLICY "Students can view rides they are passengers on"
  ON rides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ride_passengers rp
      WHERE rp.ride_id = rides.id AND rp.student_id = auth.uid()
    )
  );

CREATE POLICY "Drivers can view assigned rides"
  ON rides FOR SELECT
  USING (driver_id = auth.uid());

CREATE POLICY "Admins can view all rides"
  ON rides FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can update all rides"
  ON rides FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Service role has full access to rides"
  ON rides FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ride_passengers: students see their own bookings; drivers see passengers
-- on their assigned rides; admins read all
CREATE POLICY "Students can view own passenger records"
  ON ride_passengers FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Drivers can view passengers on assigned rides"
  ON ride_passengers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rides r
      WHERE r.id = ride_passengers.ride_id AND r.driver_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all ride passengers"
  ON ride_passengers FOR SELECT
  USING (is_admin());

-- trip_offers: drivers see their own offers; admins read all;
-- service role (broadcast-offer function) has full access
CREATE POLICY "Drivers can view own offers"
  ON trip_offers FOR SELECT
  USING (driver_id = auth.uid());

CREATE POLICY "Admins can view all trip offers"
  ON trip_offers FOR SELECT
  USING (is_admin());

CREATE POLICY "Service role has full access to trip offers"
  ON trip_offers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- notifications_log: users see their own notifications; admins read all
CREATE POLICY "Users can view own notifications"
  ON notifications_log FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "Admins can view all notifications"
  ON notifications_log FOR SELECT
  USING (is_admin());

-- driver_location: drivers write their own location; students can read
-- their driver's location only while that ride is actively underway;
-- admins read all
CREATE POLICY "Drivers can insert own location"
  ON driver_location FOR INSERT
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Drivers can update own location"
  ON driver_location FOR UPDATE
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Students can view their active driver's location"
  ON driver_location FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rides r
      JOIN ride_passengers rp ON rp.ride_id = r.id
      WHERE r.driver_id = driver_location.driver_id
        AND rp.student_id = auth.uid()
        AND r.status IN ('driver_en_route', 'at_airport', 'in_progress')
    )
  );

CREATE POLICY "Admins can view all driver locations"
  ON driver_location FOR SELECT
  USING (is_admin());

-- push_tokens: users fully manage their own tokens;
-- service role (push-sending functions) can read all
CREATE POLICY "Users can manage own push tokens"
  ON push_tokens FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can view all push tokens"
  ON push_tokens FOR SELECT
  TO service_role
  USING (true);

-- =====================================================================
-- STEP 6: Functions & Triggers
-- =====================================================================

-- Driver leave time = estimated landing minus the customs/arrivals buffer
CREATE OR REPLACE FUNCTION calculate_driver_leave_time(estimated_landing TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT estimated_landing - INTERVAL '60 minutes';
$$;

-- Luggage units = 2 per large bag + 1 per carry-on + 4 if oversized items present
CREATE OR REPLACE FUNCTION calculate_luggage_units(
  large_bags INT, carry_ons INT, oversized BOOLEAN
)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT large_bags * 2 + carry_ons + CASE WHEN oversized THEN 4 ELSE 0 END;
$$;

-- Keep rides.filled_seats in sync with the number of booked passengers.
-- SECURITY DEFINER because students (who insert ride_passengers rows) have
-- no direct UPDATE policy on `rides`.
CREATE OR REPLACE FUNCTION update_ride_filled_seats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE rides
  SET filled_seats = (
    SELECT COUNT(*) FROM ride_passengers WHERE ride_id = NEW.ride_id
  )
  WHERE id = NEW.ride_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_ride_filled_seats
  AFTER INSERT OR UPDATE ON ride_passengers
  FOR EACH ROW
  EXECUTE FUNCTION update_ride_filled_seats();

-- Recalculate a driver's average rating whenever a student rates a trip.
-- SECURITY DEFINER because students have no UPDATE policy on `driver_profiles`.
CREATE OR REPLACE FUNCTION update_driver_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
BEGIN
  SELECT driver_id INTO v_driver_id FROM rides WHERE id = NEW.ride_id;

  IF v_driver_id IS NOT NULL THEN
    UPDATE driver_profiles
    SET rating = (
      SELECT ROUND(AVG(rp.rating_given)::numeric, 2)
      FROM ride_passengers rp
      JOIN rides r ON r.id = rp.ride_id
      WHERE r.driver_id = v_driver_id AND rp.rating_given IS NOT NULL
    )
    WHERE id = v_driver_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_driver_rating
  AFTER INSERT OR UPDATE OF rating_given ON ride_passengers
  FOR EACH ROW
  WHEN (NEW.rating_given IS NOT NULL)
  EXECUTE FUNCTION update_driver_rating();
