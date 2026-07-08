import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: HomeIcon, end: true },
  { to: '/rides', label: 'Rides', icon: CarIcon, end: false },
  { to: '/drivers', label: 'Drivers', icon: DriverIcon, end: false },
  { to: '/students', label: 'Students', icon: GradCapIcon, end: false },
  { to: '/notifications', label: 'Notifications Log', icon: BellIcon, end: false },
]

export function Layout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen bg-app-bg">
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
        <div className="px-5 py-6">
          <span className="text-lg font-bold text-primary">BrandoRides</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <span className="font-semibold text-gray-900">BrandoRides Admin</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">Logged in as: {profile?.email}</span>
            <button
              onClick={signOut}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function HomeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M4 16v-3.5L6 8h12l2 4.5V16M4 16a1.5 1.5 0 0 0 3 0M17 16a1.5 1.5 0 0 0 3 0M4 16h16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DriverIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10" cy="7" r="3.2" />
      <path d="M4 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
      <circle cx="18.5" cy="16.5" r="2.2" />
      <path d="M18.5 18.7v2M17 20.5h3" strokeLinecap="round" />
    </svg>
  )
}

function GradCapIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 8l10-4 10 4-10 4-10-4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10.5v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 9v5" strokeLinecap="round" />
    </svg>
  )
}

function BellIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 10a6 6 0 1 1 12 0c0 3 1 5 1.5 5.5H4.5C5 15 6 13 6 10Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  )
}
