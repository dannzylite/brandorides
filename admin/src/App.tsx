import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import Dashboard from '@/pages/Dashboard'
import Drivers from '@/pages/Drivers'
import Login from '@/pages/Login'
import NotificationsLog from '@/pages/NotificationsLog'
import Rides from '@/pages/Rides'
import Students from '@/pages/Students'

const queryClient = new QueryClient()

function ProtectedLayout() {
  const { user, profile, isInitialized } = useAuth()

  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg text-sm text-gray-500">
        Loading...
      </div>
    )
  }
  if (!user || profile?.role !== 'admin') {
    return <Navigate to="/login" replace />
  }
  return <Layout />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="rides" element={<Rides />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="students" element={<Students />} />
        <Route path="notifications" element={<NotificationsLog />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
