import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAllProfiles, fetchNotifications } from '@/lib/adminApi'
import { safeFormat } from '@/lib/format'
import type { NotificationChannel } from '@/types'

type ChannelFilter = 'all' | NotificationChannel

export default function NotificationsLog() {
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [rideSearch, setRideSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')

  const notificationsQuery = useQuery({ queryKey: ['notifications'], queryFn: fetchNotifications })
  const profilesQuery = useQuery({ queryKey: ['all-profiles'], queryFn: fetchAllProfiles })

  const profileById = useMemo(() => new Map((profilesQuery.data ?? []).map((p) => [p.id, p])), [profilesQuery.data])

  const filtered = useMemo(() => {
    return (notificationsQuery.data ?? []).filter((n) => {
      if (channelFilter !== 'all' && n.channel !== channelFilter) return false
      if (startDate && n.sent_at < startDate) return false
      if (endDate && n.sent_at > `${endDate}T23:59:59`) return false
      if (rideSearch && !(n.ride_id ?? '').toLowerCase().includes(rideSearch.toLowerCase())) return false
      if (userSearch) {
        const recipient = profileById.get(n.recipient_id)
        const haystack = `${recipient?.full_name ?? ''} ${recipient?.email ?? ''}`.toLowerCase()
        if (!haystack.includes(userSearch.toLowerCase())) return false
      }
      return true
    })
  }, [notificationsQuery.data, channelFilter, startDate, endDate, rideSearch, userSearch, profileById])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Notifications Log</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Channel</label>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as ChannelFilter)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="all">All</option>
            <option value="push">Push</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="in_app">In-App</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Ride ID</label>
          <input type="text" value={rideSearch} onChange={(e) => setRideSearch(e.target.value)} placeholder="Ride UUID" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">User</label>
          <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Name or email" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Ride</th>
              <th className="px-4 py-3">Delivered</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((n) => (
              <tr key={n.id} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3">{safeFormat(n.sent_at, 'MMM d, h:mm a')}</td>
                <td className="px-4 py-3">{profileById.get(n.recipient_id)?.full_name ?? n.recipient_id.slice(0, 8)}</td>
                <td className="px-4 py-3">{n.type}</td>
                <td className="px-4 py-3">{n.channel}</td>
                <td className="px-4 py-3">{n.ride_id ? n.ride_id.slice(0, 8) : '—'}</td>
                <td className="px-4 py-3">{n.delivered ? 'Yes' : 'No'}</td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No notifications match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
