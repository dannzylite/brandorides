-- =====================================================================
-- BrandoRides — Account Creation & Verification Gating
-- =====================================================================
-- Accounts are created inert (profiles.is_verified = false,
-- driver_profiles.is_approved = false) and only an admin (or the
-- service role) can promote them. Drivers additionally cannot be
-- assigned to a ride at all until approved — enforced at the database
-- level so no code path (app, admin tool, matching function) can skip it.

-- =====================================================================
-- Auto-create profiles on signup
-- =====================================================================

-- Role comes from auth signup metadata, but 'admin' can never be
-- self-assigned this way — only 'student' or 'driver' are honored.
-- Admin accounts must be created by an existing admin via the
-- "Admins can update all profiles" policy below.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
BEGIN
  v_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' = 'driver' THEN 'driver'::user_role
    ELSE 'student'::user_role
  END;

  INSERT INTO profiles (id, role, full_name, email, phone)
  VALUES (
    NEW.id,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  );

  -- student_profiles has no required onboarding fields, so it's safe to
  -- create immediately. driver_profiles requires vehicle info the driver
  -- doesn't have yet at signup, so it's created later via the driver's
  -- own onboarding insert (see policy below).
  IF v_role = 'student' THEN
    INSERT INTO student_profiles (id) VALUES (NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =====================================================================
-- New RLS policies
-- =====================================================================

-- Drivers create their own driver_profiles row during onboarding
-- (after signup, once they have vehicle info and documents to submit).
CREATE POLICY "Drivers can insert own driver profile"
  ON driver_profiles FOR INSERT
  WITH CHECK (
    id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'driver'
    )
  );

-- Admins need UPDATE on profiles to actually flip is_verified
-- (they already had SELECT from 001, and this also lets them fix role
-- assignments — the only legitimate way an account ever becomes admin).
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- =====================================================================
-- Guard privileged fields against self-modification
-- =====================================================================

-- Only an admin or the service role may change driver approval status,
-- whether at insert (a driver can't insert themselves pre-approved) or
-- update (a driver can't flip their own row later).
CREATE OR REPLACE FUNCTION protect_driver_approval_field()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.is_approved = TRUE)
     OR (TG_OP = 'UPDATE' AND NEW.is_approved IS DISTINCT FROM OLD.is_approved)
  THEN
    IF NOT (is_admin() OR auth.role() = 'service_role') THEN
      RAISE EXCEPTION 'Only admins can change driver approval status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_driver_approval
  BEFORE INSERT OR UPDATE ON driver_profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_driver_approval_field();

-- Only an admin or the service role may change a profile's verification
-- status or role (blocks self-verification and self-promotion via the
-- existing "Users can update own profile" policy). UPDATE-only: profiles
-- INSERT only ever happens through handle_new_user() above, which
-- already restricts role to student/driver and leaves is_verified at
-- its default of false.
CREATE OR REPLACE FUNCTION protect_profile_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.role IS DISTINCT FROM OLD.role
  THEN
    IF NOT (is_admin() OR auth.role() = 'service_role') THEN
      RAISE EXCEPTION 'Only admins can change verification status or role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_profile_privileged_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_profile_privileged_fields();

-- =====================================================================
-- Enforce driver approval before pickup assignment
-- =====================================================================

-- A ride's driver_id can only ever be set to an approved driver.
-- Applies to every writer (app, admin tool, matching function) since
-- triggers fire regardless of RLS/role — this cannot be bypassed by
-- forgetting a check in application code.
CREATE OR REPLACE FUNCTION check_driver_approved_for_ride()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.driver_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM driver_profiles
      WHERE id = NEW.driver_id AND is_approved = TRUE
    ) THEN
      RAISE EXCEPTION 'Driver % is not approved and cannot be assigned to a ride', NEW.driver_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_driver_approved
  BEFORE INSERT OR UPDATE OF driver_id ON rides
  FOR EACH ROW
  EXECUTE FUNCTION check_driver_approved_for_ride();
