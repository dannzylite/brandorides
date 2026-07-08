import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns'
import { RideStatusBadge } from '@/components/StatusBadge'
import { fetchApprovedAvailableDriverIdsToday, fetchAllDrivers, fetchRides } from '@/lib/adminApi'
import { formatCurrency, safeFormat } from '@/lib/format'

const THREE_HOURS_MS = 3 * 60 * 60 * 1000
const PLATFORM_FEE_PERCENT = 20

export default function Dashboard() {
  const navigate = useNavigate()
  const ridesQuery = useQuery({ queryKey: ['rides'], queryFn: fetchRides })
  const driversQuery = useQuery({ queryKey: ['drivers'], queryFn: fetchAllDrivers })
  const availableTodayQuery = useQuery({
    queryKey: ['available-today'],
    queryFn: fetchApprovedAvailableDriverIdsToday,
  })

  const rides = ridesQuery.data ?? []
  const drivers = driversQuery.data ?? []
  const availableTodayIds = availableTodayQuery.data ?? new Set<string>()

  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)

    const thisMonthRides = rides.filter((r) => {
      const d = new Date(r.departure_date)
      return d >= monthStart && d <= monthEnd
    })

    const unassigned = rides.filter((r) => r.status === 'pending_driver')
    const activeDrivers = drivers.filter((d) => d.is_approved && availableTodayIds.has(d.id))

    // "Collected" means actually paid — with no payment flow live yet
    // (Phase 7), this is honestly $0 rather than a projected total.
    const revenueCents = 0

    return {
      totalRidesThisMonth: thisMonthRides.length,
      unassignedCount: unassigned.length,
      activeDriverCount: activeDrivers.length,
      revenueCents,
    }
  }, [rides, drivers, availableTodayIds])

  const urgentRides = useMemo(() => {
    const now = Date.now()
    return rides.filter((r) => r.status === 'pending_driver' && now - new Date(r.created_at).getTime() > THREE_HOURS_MS)
  }, [rides])

  const upcomingRides = useMemo(() => {
    const now = new Date()
    const weekStart = startOfWeek(now, { weekStartsOn: 0 })
    const weekEnd = endOfWeek(now, { weekStartsOn: 0 })
    return rides
      .filter((r) => {
        const d = new Date(r.departure_date)
        return r.status !== 'cancelled' && d >= weekStart && d <= weekEnd
      })
      .sort((a, b) => a.departure_date.localeCompare(b.departure_date))
  }, [rides])

  const driverNameById = useMemo(() => new Map(drivers.map((d) => [d.id, d.profile?.full_name ?? 'Unknown'])), [drivers])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Platform fee is currently {PLATFORM_FEE_PERCENT}%.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Rides This Month" value={stats.totalRidesThisMonth} />
        <StatCard
          label="Unassigned Rides"
          value={stats.unassignedCount}
          highlight={stats.unassignedCount > 0}
        />
        <StatCard label="Active Drivers" value={stats.activeDriverCount} />
        <StatCard label="Revenue This Month" value={formatCurrency(stats.revenueCents)} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Needs Attention</h2>
        {urgentRides.length === 0 ? (
          <p className="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
            No rides have been waiting more than 3 hours for a driver.
          </p>
        ) : (
          <div className="space-y-3">
            {urgentRides.map((ride) => (
              <div key={ride.id} className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4">
                <div>
                  <p className="font-semibold text-gray-900">
                    {safeFormat(ride.departure_date, 'MMM d, yyyy')} · {ride.flight_number}
                  </p>
                  <p className="text-sm text-gray-500">{ride.filled_seats} student(s) waiting</p>
                </div>
                <button
                  onClick={() => navigate(`/rides?rideId=${ride.id}`)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Assign Driver
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Upcoming Rides This Week</h2>
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Flight</th>
                <th className="px-4 py-3">Students</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {upcomingRides.map((ride) => (
                <tr
                  key={ride.id}
                  onClick={() => navigate(`/rides?rideId=${ride.id}`)}
                  className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">{safeFormat(ride.departure_date, 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3">{ride.flight_number}</td>
                  <td className="px-4 py-3">{ride.filled_seats}</td>
                  <td className="px-4 py-3">{ride.driver_id ? driverNameById.get(ride.driver_id) ?? '—' : '—'}</td>
                  <td className="px-4 py-3">
                    <RideStatusBadge status={ride.status} />
                  </td>
                </tr>
              ))}
              {upcomingRides.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    No rides scheduled this week.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-5 shadow-sm ${highlight ? 'bg-red-50 ring-1 ring-red-200' : 'bg-white'}`}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${highlight ? 'text-danger' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
