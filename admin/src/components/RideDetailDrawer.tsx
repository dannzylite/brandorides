import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RideStatusBadge } from '@/components/StatusBadge'
import {
  assignDriverToRide,
  fetchAllDrivers,
  fetchApprovedAvailableDriverIdsToday,
  fetchNotificationsForRide,
  fetchRideById,
  fetchRidePassengers,
  updateRideStatus,
} from '@/lib/adminApi'
import { fetchLiveFlightStatus } from '@/lib/aviationstack'
import { formatCurrency, safeFormat } from '@/lib/format'
import type { RideStatus } from '@/types'

const RIDE_STATUSES: RideStatus[] = [
  'pending_driver',
  'confirmed',
  'driver_en_route',
  'at_airport',
  'in_progress',
  'completed',
  'cancelled',
]

export function RideDetailDrawer({ rideId, onClose }: { rideId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [selectedDriverId, setSelectedDriverId] = useState('')

  const rideQuery = useQuery({ queryKey: ['ride', rideId], queryFn: () => fetchRideById(rideId) })
  const passengersQuery = useQuery({ queryKey: ['ride-passengers', rideId], queryFn: () => fetchRidePassengers(rideId) })
  const driversQuery = useQuery({ queryKey: ['drivers'], queryFn: fetchAllDrivers })
  const availableTodayQuery = useQuery({ queryKey: ['available-today'], queryFn: fetchApprovedAvailableDriverIdsToday })
  const notificationsQuery = useQuery({ queryKey: ['ride-notifications', rideId], queryFn: () => fetchNotificationsForRide(rideId) })

  const ride = rideQuery.data
  const flightQuery = useQuery({
    queryKey: ['flight-status', ride?.flight_number, ride?.departure_date],
    queryFn: () => fetchLiveFlightStatus(ride!.flight_number, ride!.departure_date),
    enabled: !!ride,
  })

  const statusMutation = useMutation({
    mutationFn: (status: RideStatus) => updateRideStatus(rideId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ride', rideId] })
      queryClient.invalidateQueries({ queryKey: ['rides'] })
    },
  })

  const assignMutation = useMutation({
    mutationFn: () => assignDriverToRide(rideId, selectedDriverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ride', rideId] })
      queryClient.invalidateQueries({ queryKey: ['rides'] })
      queryClient.invalidateQueries({ queryKey: ['ride-notifications', rideId] })
    },
  })

  const drivers = driversQuery.data ?? []
  const availableTodayIds = availableTodayQuery.data ?? new Set<string>()
  const assignableDrivers = drivers.filter((d) => d.is_approved && availableTodayIds.has(d.id))
  const currentDriver = drivers.find((d) => d.id === ride?.driver_id)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {!ride ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{ride.flight_number}</h2>
                <p className="text-sm text-gray-500">{safeFormat(ride.departure_date, 'EEEE, MMM d, yyyy')}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <Section title="Ride Details">
              <Row label="Status" value={<RideStatusBadge status={ride.status} />} />
              <Row label="Type" value={ride.ride_type} />
              <Row label="Vehicle Required" value={ride.vehicle_class_required} />
              <Row label="Seats" value={`${ride.filled_seats} / ${ride.total_seats}`} />
              <Row label="Pickup" value={ride.pickup_location} />
              <Row label="Dropoff" value={ride.dropoff_area} />
              <Row label="Estimated Landing" value={safeFormat(ride.estimated_landing, 'h:mm a')} />
              <Row label="Fare / Seat" value={formatCurrency(ride.base_fare_per_seat)} />
            </Section>

            <Section title="Live Flight Status">
              {flightQuery.data ? (
                <>
                  <Row label="Status" value={flightQuery.data.status} />
                  <Row label="Estimated Arrival" value={safeFormat(flightQuery.data.estimatedArrival, 'h:mm a')} />
                </>
              ) : (
                <p className="text-sm text-gray-400">Unavailable</p>
              )}
            </Section>

            <Section title="Passengers">
              {(passengersQuery.data ?? []).map((p) => (
                <div key={p.id} className="border-b border-gray-50 py-2 last:border-0">
                  <p className="text-sm font-medium text-gray-900">{p.profile?.full_name ?? 'Unknown student'}</p>
                  <p className="text-xs text-gray-500">
                    {p.large_bags} large bag(s), {p.carry_ons} carry-on(s){p.oversized_items ? ', oversized' : ''} ·{' '}
                    {p.luggage_units} units · {formatCurrency(p.seat_fare)}
                  </p>
                </div>
              ))}
              {(passengersQuery.data ?? []).length === 0 ? <p className="text-sm text-gray-400">No passengers.</p> : null}
            </Section>

            <Section title="Driver">
              {currentDriver ? (
                <>
                  <Row label="Name" value={currentDriver.profile?.full_name ?? '—'} />
                  <Row label="Vehicle" value={`${currentDriver.vehicle_color} ${currentDriver.vehicle_make} ${currentDriver.vehicle_model}`} />
                  <Row label="Plate" value={currentDriver.vehicle_plate} />
                </>
              ) : (
                <p className="text-sm text-gray-400">No driver assigned.</p>
              )}
            </Section>

            <Section title="Status Override">
              <select
                value={ride.status}
                onChange={(e) => statusMutation.mutate(e.target.value as RideStatus)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                {RIDE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Section>

            <Section title="Manual Driver Assignment">
              <div className="flex gap-2">
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Select a driver...</option>
                  {assignableDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.profile?.full_name} ({d.vehicle_class})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => assignMutation.mutate()}
                  disabled={!selectedDriverId || assignMutation.isPending}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Assign
                </button>
              </div>
              {assignableDrivers.length === 0 ? (
                <p className="mt-2 text-xs text-gray-400">No approved, available-today drivers found.</p>
              ) : null}
            </Section>

            <Section title="Notification History">
              {(notificationsQuery.data ?? []).map((n) => (
                <div key={n.id} className="border-b border-gray-50 py-2 text-sm last:border-0">
                  <p className="text-gray-900">{n.message}</p>
                  <p className="text-xs text-gray-400">
                    {safeFormat(n.sent_at, 'MMM d, h:mm a')} · {n.channel}
                  </p>
                </div>
              ))}
              {(notificationsQuery.data ?? []).length === 0 ? <p className="text-sm text-gray-400">No notifications yet.</p> : null}
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="rounded-xl bg-gray-50 p-4">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  )
}
