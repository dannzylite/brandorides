-- =====================================================================
-- BrandoRides — Enable Realtime on rides
-- =====================================================================
-- The ride-status screen subscribes to postgres_changes on `rides` so a
-- student sees status updates (driver assigned, en route, etc.) live.
-- Tables aren't in the supabase_realtime publication by default.

ALTER PUBLICATION supabase_realtime ADD TABLE rides;
