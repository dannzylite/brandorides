import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RideStatusBadge } from '@/components/StatusBadge'
import {
  assignDriverToRide,
  fetchAllDrivers,
  fetchApprovedAvailableDriverIdsToday,
  fetchMissedConnectionRequests,
  fetchNotificationsForRide,
  fetchRideById,
  fetchRidePassengers,
  resolveMissedConnectionRequest,
  updateFlightStatus,
  updateRideStatus,
  type FlightUpdateInput,
} from '@/lib/adminApi'
import { checkFlightForAdmin, type FlightValidationResult } from '@/lib/aviationstack'
import { formatCurrency, safeFormat } from '@/lib/format'
import type { Ride, RideStatus } from '@/types'

const FLIGHT_STATUSES: Ride['flight_status'][] = ['scheduled', 'departed', 'delayed', 'landed', 'cancelled']

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
  const missedConnectionsQuery = useQuery({
    queryKey: ['missed-connections', rideId],
    queryFn: () => fetchMissedConnectionRequests(rideId),
  })

  const [flightForm, setFlightForm] = useState<FlightUpdateInput>({ estimatedLanding: '', flightStatus: 'scheduled', notes: '' })
  const [flightChecks, setFlightChecks] = useState<Record<string, FlightValidationResult>>({})
  const [checkingRequestId, setCheckingRequestId] = useState<string | null>(null)

  // Pre-fill the form from the ride's current flight so a plain delay/
  // cancellation update (same flight, new timing) needs no extra typing —
  // the admin only overwrites what's actually changing.
  useEffect(() => {
    if (!ride) return
    setFlightForm({
      flightNumber: ride.flight_number,
      originCity: ride.flight_origin_city ?? ride.flight_origin,
      originCode: ride.flight_origin_code ?? '',
      departureDate: ride.departure_date,
      departureTime: ride.departure_time ?? '',
      estimatedLanding: ride.estimated_landing,
      flightStatus: ride.flight_status,
      notes: '',
    })
  }, [ride?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const flightMutation = useMutation({
    mutationFn: () => updateFlightStatus(rideId, flightForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ride', rideId] })
      queryClient.invalidateQueries({ queryKey: ['rides'] })
      queryClient.invalidateQueries({ queryKey: ['ride-notifications', rideId] })
    },
  })

  const handleCheckFlight = async (requestId: string, flightNumber: string, date: string) => {
    setCheckingRequestId(requestId)
    try {
      const result = await checkFlightForAdmin(flightNumber, date)
      setFlightChecks((prev) => ({ ...prev, [requestId]: result }))
    } finally {
      setCheckingRequestId(null)
    }
  }

  const handleUseCheckedFlight = (flightNumber: string, date: string, result: FlightValidationResult) => {
    if (!result.estimatedLanding) return
    setFlightForm({
      flightNumber,
      originCity: result.originCity ?? undefined,
      originCode: result.originCode ?? undefined,
      departureDate: date,
      departureTime: result.departureTime ?? undefined,
      estimatedLanding: result.estimatedLanding,
      flightStatus: result.flightStatus === 'cancelled' ? 'cancelled' : result.flightStatus === 'landed' ? 'landed' : 'scheduled',
      notes: `Verified via AviationStack: ${result.airline ?? 'unknown airline'} from ${result.originCity ?? '?'} (${result.originCode ?? '?'})`,
    })
  }

  const resolveMissedConnectionMutation = useMutation({
    mutationFn: (id: string) => resolveMissedConnectionRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['missed-connections', rideId] }),
  })

  const drivers = driversQuery.data ?? []
  const availableTodayIds = availableTodayQuery.data ?? new Set<string>()
  const assignableDrivers = drivers.filter((d) => d.is_approved && availableTodayIds.has(d.id))
  const currentDriver = drivers.find((d) => d.id === ride?.driver_id)
  const pendingMissedConnections = (missedConnectionsQuery.data ?? []).filter((r) => r.status === 'pending')

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

            <Section title="Flight Status">
              <Row label="Status" value={ride.flight_status} />
              <Row label="Estimated Landing" value={safeFormat(ride.estimated_landing, 'h:mm a')} />
              <Row label="Actual Landing" value={ride.actual_landing ? safeFormat(ride.actual_landing, 'h:mm a') : '—'} />
              <Row label="Departure Time" value={ride.departure_time ? safeFormat(ride.departure_time, 'h:mm a') : '—'} />
            </Section>

            {pendingMissedConnections.length > 0 ? (
              <Section title="Missed Connection Reports">
                {pendingMissedConnections.map((r) => (
                  <div key={r.id} className="mb-3 rounded-lg bg-amber-50 p-3 last:mb-0">
                    <p className="text-sm text-gray-900">
                      Old: <span className="font-medium">{r.old_flight_number}</span> → New:{' '}
                      <span className="font-medium">{r.new_flight_number}</span> on {safeFormat(r.new_date, 'MMM d, yyyy')}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Submitted {safeFormat(r.submitted_at, 'MMM d, h:mm a')}</p>

                    <button
                      onClick={() => handleCheckFlight(r.id, r.new_flight_number, r.new_date)}
                      disabled={checkingRequestId === r.id}
                      className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {checkingRequestId === r.id ? 'Checking...' : `Check Flight ${r.new_flight_number}`}
                    </button>

                    {flightChecks[r.id] ? (
                      <div className="mt-2 rounded-lg bg-white p-2">
                        {flightChecks[r.id].error ? (
                          <p className="text-xs text-red-600">{flightChecks[r.id].error}</p>
                        ) : !flightChecks[r.id].isWinnipegBound ? (
                          <p className="text-xs text-red-600">
                            {r.new_flight_number} doesn't land in Winnipeg (YWG) — this flight can't be used for this ride.
                          </p>
                        ) : (
                          <>
                            <p className="text-xs text-gray-900">
                              {flightChecks[r.id].airline} from {flightChecks[r.id].originCity} ({flightChecks[r.id].originCode})
                            </p>
                            <p className="text-xs text-gray-500">
                              Lands {safeFormat(flightChecks[r.id].estimatedLanding, 'h:mm a, MMM d')} · status: {flightChecks[r.id].flightStatus}
                            </p>
                            <button
                              onClick={() => handleUseCheckedFlight(r.new_flight_number, r.new_date, flightChecks[r.id])}
                              className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              Use This in Update Flight Form
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}

                    <p className="mt-2 text-xs text-gray-600">
                      Check the new flight above, then "Use This" fills in the form below — hit "Update Flight" to
                      apply it, which also resolves this report automatically. Only dismiss below if this report
                      shouldn't be acted on at all (e.g. duplicate or spam).
                    </p>
                    <button
                      onClick={() => resolveMissedConnectionMutation.mutate(r.id)}
                      disabled={resolveMissedConnectionMutation.isPending}
                      className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Dismiss Without Updating
                    </button>
                  </div>
                ))}
              </Section>
            ) : null}

            <Section title="Update Flight Status">
              <label className="mb-1 block text-xs font-medium text-gray-500">Flight number</label>
              <input
                type="text"
                value={flightForm.flightNumber ?? ''}
                onChange={(e) => setFlightForm({ ...flightForm, flightNumber: e.target.value.toUpperCase() })}
                className="mb-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm uppercase focus:border-primary focus:outline-none"
              />
              <label className="mb-1 block text-xs font-medium text-gray-500">Origin</label>
              <div className="mb-3 flex gap-2">
                <input
                  type="text"
                  value={flightForm.originCity ?? ''}
                  onChange={(e) => setFlightForm({ ...flightForm, originCity: e.target.value })}
                  placeholder="City"
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <input
                  type="text"
                  value={flightForm.originCode ?? ''}
                  onChange={(e) => setFlightForm({ ...flightForm, originCode: e.target.value.toUpperCase() })}
                  placeholder="Code"
                  className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm uppercase focus:border-primary focus:outline-none"
                />
              </div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Departure date</label>
              <input
                type="date"
                value={flightForm.departureDate ?? ''}
                onChange={(e) => setFlightForm({ ...flightForm, departureDate: e.target.value })}
                className="mb-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <label className="mb-1 block text-xs font-medium text-gray-500">New estimated landing time</label>
              <input
                type="datetime-local"
                value={flightForm.estimatedLanding ? flightForm.estimatedLanding.slice(0, 16) : ''}
                onChange={(e) =>
                  setFlightForm({ ...flightForm, estimatedLanding: e.target.value ? new Date(e.target.value).toISOString() : '' })
                }
                className="mb-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <label className="mb-1 block text-xs font-medium text-gray-500">Flight status</label>
              <select
                value={flightForm.flightStatus}
                onChange={(e) => setFlightForm({ ...flightForm, flightStatus: e.target.value as Ride['flight_status'] })}
                className="mb-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                {FLIGHT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-xs font-medium text-gray-500">Reason / notes</label>
              <textarea
                value={flightForm.notes}
                onChange={(e) => setFlightForm({ ...flightForm, notes: e.target.value })}
                rows={2}
                className="mb-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
              />
              <button
                onClick={() => flightMutation.mutate()}
                disabled={!flightForm.estimatedLanding || flightMutation.isPending}
                className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Update Flight
              </button>
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
