export const VEHICLE_CAPACITY = {
  sedan: { max_passengers: 2, max_luggage_units: 6 },
  suv: { max_passengers: 3, max_luggage_units: 10 },
  minivan: { max_passengers: 4, max_luggage_units: 14 },
  truck: { max_passengers: 2, max_luggage_units: 16 },
}

export const VEHICLE_CLASS_LABELS = {
  sedan: 'Sedan',
  suv: 'SUV',
  minivan: 'Minivan',
  truck: 'Truck',
}

export const LUGGAGE_UNITS = {
  large_bag: 2,
  carry_on: 1,
  oversized: 4,
}

export const PRICING = {
  shared_sedan_per_seat: 7500,      // in cents
  shared_suv_per_seat: 6500,
  shared_minivan_per_seat: 6500,
  solo_flat: 16000,
  oversized_surcharge: 1500,
  wait_fee_per_15_min: 1000,
  free_wait_minutes: 30,
  platform_fee_percent: 20,
  driver_percent: 80,
}

export const TIMING = {
  customs_buffer_minutes: 60,
  brandon_to_winnipeg_minutes: 120,
  grouping_window_minutes: 90,
  offer_rating_delay_tier1_minutes: 0,
  offer_rating_delay_tier2_minutes: 5,
  offer_rating_delay_tier3_minutes: 10,
  offer_timeout_reminder_minutes: 30,
  offer_expand_minutes: 60,
  offer_admin_alert_hours: 3,
  flight_monitor_interval_minutes: 15,
  flight_change_threshold_minutes: 10,
}

export const BRANDON_WINNIPEG = {
  pickup_location:
    'Winnipeg James Armstrong Richardson International Airport - International Arrivals Hall, Ground Level',
  drive_time_minutes: 120,
}

// No real historical trip-volume data exists yet (fresh system) — these
// are explicit, labeled assumptions for the monthly earnings projection,
// not measured averages. Revisit once completed-trip data exists.
export const EARNINGS_PROJECTION = {
  avg_trips_per_available_day_low: 0.4,
  avg_trips_per_available_day_high: 0.7,
  avg_earnings_per_trip_low: 5000, // cents
  avg_earnings_per_trip_high: 8000,
}

export const MAP_COORDS = {
  brandon: { latitude: 49.848, longitude: -99.951 },
  winnipegAirport: { latitude: 49.91, longitude: -97.2398 },
}

export const AVAILABILITY_LOCK_WINDOW_DAYS = 14
