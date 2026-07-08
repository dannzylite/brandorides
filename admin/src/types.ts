export type UserRole = 'student' | 'driver' | 'admin'

export type VehicleClass = 'sedan' | 'suv' | 'minivan' | 'truck'

export type RideStatus =
  | 'pending_driver'
  | 'confirmed'
  | 'driver_en_route'
  | 'at_airport'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type RideType = 'shared' | 'solo'

export type PaymentStatus = 'pending' | 'paid' | 'refunded'

export type StudentTripStatus = 'booked' | 'landed' | 'at_arrivals' | 'in_vehicle' | 'completed'

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'

export type NotificationChannel = 'push' | 'sms' | 'email' | 'in_app'

export type TimePreference = 'morning' | 'afternoon' | 'flexible'

export interface Profile {
  id: string
  role: UserRole
  full_name: string
  email: string
  phone: string
  avatar_url: string | null
  is_verified: boolean
  created_at: string
}

export interface DriverProfile {
  id: string
  license_url: string | null
  insurance_url: string | null
  vehicle_make: string
  vehicle_model: string
  vehicle_year: number
  vehicle_color: string
  vehicle_plate: string
  vehicle_class: VehicleClass
  max_passengers: number
  max_luggage_units: number
  rating: number
  total_trips: number
  stripe_account_id: string | null
  is_approved: boolean
  created_at: string
}

export interface StudentProfile {
  id: string
  student_id_url: string | null
  acceptance_letter_url: string | null
  university: string
  stripe_customer_id: string | null
  created_at: string
}

export interface Ride {
  id: string
  status: RideStatus
  ride_type: RideType
  departure_date: string
  flight_number: string
  flight_origin: string
  estimated_landing: string
  actual_landing: string | null
  driver_id: string | null
  vehicle_class_required: VehicleClass
  total_seats: number
  filled_seats: number
  base_fare_per_seat: number
  platform_fee_percent: number
  driver_earnings: number
  wait_fee_total: number
  pickup_location: string
  dropoff_area: string
  driver_leave_time: string | null
  created_at: string
}

export interface RidePassenger {
  id: string
  ride_id: string
  student_id: string
  large_bags: number
  carry_ons: number
  oversized_items: boolean
  luggage_units: number
  seat_fare: number
  wait_fee_charged: number
  payment_intent_id: string | null
  payment_status: PaymentStatus
  student_status: StudentTripStatus
  rating_given: number | null
  created_at: string
}

export interface TripOffer {
  id: string
  ride_id: string
  driver_id: string
  status: OfferStatus
  offered_at: string
  responded_at: string | null
  expires_at: string
}

export interface DriverAvailability {
  id: string
  driver_id: string
  day_of_week: number | null
  is_blackout: boolean
  blackout_date: string | null
  time_preference: TimePreference
  created_at: string
}

export interface NotificationLog {
  id: string
  recipient_id: string
  ride_id: string | null
  type: string
  channel: NotificationChannel
  message: string
  sent_at: string
  delivered: boolean
}
