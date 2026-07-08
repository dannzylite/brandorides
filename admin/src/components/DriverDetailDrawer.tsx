import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchDriverAvailability, fetchDriverProfileById, fetchRidesByDriver } from '@/lib/adminApi'
import { formatCurrency, safeFormat } from '@/lib/format'
import type { RidePassenger } from '@/types'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function DriverDetailDrawer({ driverId, onClose }: { driverId: string; onClose: () => void }) {
  const driverQuery = useQuery({ queryKey: ['driver', driverId], queryFn: () => fetchDriverProfileById(driverId) })
  const availabilityQuery = useQuery({ queryKey: ['driver-availability', driverId], queryFn: () => fetchDriverAvailability(driverId) })
  const ridesQuery = useQuery({ queryKey: ['driver-rides', driverId], queryFn: () => fetchRidesByDriver(driverId) })

  const completedRideIds = (ridesQuery.data ?? []).filter((r) => r.status === 'completed').map((r) => r.id)
  const passengersQuery = useQuery({
    queryKey: ['driver-completed-passengers', driverId, completedRideIds],
    queryFn: async () => {
      if (completedRideIds.length === 0) return [] as RidePassenger[]
      const { data, error } = await supabase.from('ride_passengers').select('*').in('ride_id', completedRideIds)
      if (error) throw error
      return (data ?? []) as RidePassenger[]
    },
  })

  const driver = driverQuery.data
  const weekdayAvailability = new Map((availabilityQuery.data ?? []).filter((a) => !a.is_blackout).map((a) => [a.day_of_week, a]))
  const totalEarningsCents = Math.round((passengersQuery.data ?? []).reduce((sum, p) => sum + p.seat_fare + p.wait_fee_charged, 0) * 0.8)
  const ratings = (passengersQuery.data ?? []).filter((p) => p.rating_given != null)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {!driver ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{driver.profile?.full_name}</h2>
                <p className="text-sm text-gray-500">{driver.profile?.email}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <Section title="Profile">
              <Row label="Phone" value={driver.profile?.phone ?? '—'} />
              <Row label="Vehicle" value={`${driver.vehicle_color} ${driver.vehicle_year} ${driver.vehicle_make} ${driver.vehicle_model}`} />
              <Row label="Plate" value={driver.vehicle_plate} />
              <Row label="Class" value={driver.vehicle_class} />
              <Row label="Rating" value={`${driver.rating.toFixed(1)} ★`} />
              <Row label="Total Trips" value={String(driver.total_trips)} />
            </Section>

            <Section title="Weekly Availability">
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {WEEKDAY_LABELS.map((label, day) => (
                  <div key={day} className={`rounded-lg py-2 ${weekdayAvailability.has(day) ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'}`}>
                    {label}
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Earnings Summary">
              <Row label="Completed Trips" value={String(completedRideIds.length)} />
              <Row label="Total Earnings" value={formatCurrency(totalEarningsCents)} />
            </Section>

            <Section title="Trip History">
              {(ridesQuery.data ?? []).map((ride) => (
                <div key={ride.id} className="flex justify-between border-b border-gray-50 py-2 text-sm last:border-0">
                  <span className="text-gray-900">
                    {ride.flight_number} · {safeFormat(ride.departure_date, 'MMM d, yyyy')}
                  </span>
                  <span className="text-gray-500">{ride.status}</span>
                </div>
              ))}
              {(ridesQuery.data ?? []).length === 0 ? <p className="text-sm text-gray-400">No trips yet.</p> : null}
            </Section>

            <Section title="Rating History">
              {ratings.map((p) => (
                <div key={p.id} className="flex justify-between border-b border-gray-50 py-2 text-sm last:border-0">
                  <span className="text-gray-900">{'★'.repeat(p.rating_given ?? 0)}</span>
                  <span className="text-gray-400">{safeFormat(p.created_at, 'MMM d, yyyy')}</span>
                </div>
              ))}
              {ratings.length === 0 ? <p className="text-sm text-gray-400">No ratings yet.</p> : null}
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
