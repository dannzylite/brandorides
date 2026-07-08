import { create } from 'zustand';
import type { FlightInfo } from '@/lib/aviationstack';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { Ride, RidePassenger, RideType, StudentTripStatus, VehicleClass } from '@/types';
import { calculatePrice, findCompatibleRide, recommendedVehicleClass } from '@/utils';
import { VEHICLE_CAPACITY } from '@/constants';

export interface BookingDraft {
  flightNumber?: string;
  departureDate?: string;
  flightInfo?: FlightInfo;
  largeBags?: number;
  carryOns?: number;
  oversizedItems?: boolean;
  rideType?: RideType;
  dropoffArea?: string;
}

interface RideState {
  currentRide: Ride | null;
  myPassengerRecord: RidePassenger | null;
  bookingDraft: BookingDraft;
  isLoading: boolean;

  updateBookingDraft: (patch: Partial<BookingDraft>) => void;
  resetBookingDraft: () => void;
  fetchMyActiveRide: () => Promise<void>;
  createBooking: (data: BookingDraft) => Promise<void>;
  updatePassengerStatus: (status: StudentTripStatus) => Promise<void>;
  cancelBooking: () => Promise<void>;
}

const ACTIVE_STATUSES = ['pending_driver', 'confirmed', 'driver_en_route', 'at_airport', 'in_progress'];

export const useRideStore = create<RideState>((set, get) => ({
  currentRide: null,
  myPassengerRecord: null,
  bookingDraft: {},
  isLoading: false,

  updateBookingDraft: (patch) => set((state) => ({ bookingDraft: { ...state.bookingDraft, ...patch } })),

  resetBookingDraft: () => set({ bookingDraft: {} }),

  fetchMyActiveRide: async () => {
    const user = useAuthStore.getState().user;
    if (!user) {
      set({ currentRide: null, myPassengerRecord: null });
      return;
    }

    set({ isLoading: true });
    try {
      const { data: passengerRows, error: passengerError } = await supabase
        .from('ride_passengers')
        .select('*')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false });

      if (passengerError) throw passengerError;

      const passengerRecords = (passengerRows ?? []) as RidePassenger[];
      if (passengerRecords.length === 0) {
        set({ currentRide: null, myPassengerRecord: null });
        return;
      }

      const rideIds = passengerRecords.map((record) => record.ride_id);
      const { data: rideRows, error: ridesError } = await supabase.from('rides').select('*').in('id', rideIds);
      if (ridesError) throw ridesError;

      const rides = (rideRows ?? []) as Ride[];
      const active = rides
        .filter((ride) => ACTIVE_STATUSES.includes(ride.status))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      if (!active) {
        set({ currentRide: null, myPassengerRecord: null });
        return;
      }

      const passenger = passengerRecords.find((record) => record.ride_id === active.id) ?? null;
      set({ currentRide: active, myPassengerRecord: passenger });
    } finally {
      set({ isLoading: false });
    }
  },

  createBooking: async (data) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('You must be logged in to book a ride.');
    if (!data.flightInfo || !data.departureDate || !data.rideType || !data.dropoffArea) {
      throw new Error('Booking details are incomplete.');
    }

    const largeBags = data.largeBags ?? 0;
    const carryOns = data.carryOns ?? 0;
    const oversizedItems = data.oversizedItems ?? false;
    const luggageUnits = largeBags * 2 + carryOns + (oversizedItems ? 4 : 0);

    const vehicleClass: VehicleClass = recommendedVehicleClass(luggageUnits) ?? 'truck';
    const landing = new Date(data.flightInfo.estimated_arrival);
    const price = calculatePrice(data.rideType, vehicleClass, oversizedItems);

    set({ isLoading: true });
    try {
      let rideId = await findCompatibleRide(landing, luggageUnits, data.rideType);

      if (!rideId) {
        const totalSeats = data.rideType === 'solo' ? 1 : VEHICLE_CAPACITY[vehicleClass].max_passengers;
        const { data: newRide, error: rideError } = await supabase
          .from('rides')
          .insert({
            ride_type: data.rideType,
            departure_date: data.departureDate,
            flight_number: data.flightInfo.flight_number,
            flight_origin: data.flightInfo.origin.name,
            estimated_landing: data.flightInfo.estimated_arrival,
            vehicle_class_required: vehicleClass,
            total_seats: totalSeats,
            base_fare_per_seat: price.baseFare,
            dropoff_area: data.dropoffArea,
          })
          .select()
          .single();

        if (rideError) throw rideError;
        rideId = (newRide as Ride).id;
      }

      const { error: passengerError } = await supabase.from('ride_passengers').insert({
        ride_id: rideId,
        student_id: user.id,
        large_bags: largeBags,
        carry_ons: carryOns,
        oversized_items: oversizedItems,
        seat_fare: price.total,
      });

      if (passengerError) throw passengerError;

      get().resetBookingDraft();
      await get().fetchMyActiveRide();
    } finally {
      set({ isLoading: false });
    }
  },

  updatePassengerStatus: async (status) => {
    const passenger = get().myPassengerRecord;
    if (!passenger) return;

    const { error } = await supabase
      .from('ride_passengers')
      .update({ student_status: status })
      .eq('id', passenger.id);

    if (error) throw error;
    set({ myPassengerRecord: { ...passenger, student_status: status } });
  },

  cancelBooking: async () => {
    const passenger = get().myPassengerRecord;
    if (!passenger) return;

    // Goes through the cancel_booking() RPC rather than a plain delete —
    // if this was the ride's last passenger, it also cancels the ride
    // itself and resolves any pending/accepted trip_offers for it, so a
    // driver never keeps seeing (or holding) a trip that no longer has
    // anyone booked on it.
    const { error } = await supabase.rpc('cancel_booking', { p_passenger_id: passenger.id });
    if (error) throw error;

    set({ currentRide: null, myPassengerRecord: null });
  },
}));
