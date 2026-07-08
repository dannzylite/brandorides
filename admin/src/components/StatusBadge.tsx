const VARIANT_CLASSES: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
  danger: 'bg-red-100 text-red-700',
  neutral: 'bg-gray-100 text-gray-600',
}

export function StatusBadge({ label, variant = 'neutral' }: { label: string; variant?: keyof typeof VARIANT_CLASSES }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${VARIANT_CLASSES[variant]}`}>
      {label}
    </span>
  )
}

const RIDE_STATUS_LABELS: Record<string, string> = {
  pending_driver: 'Finding Driver',
  confirmed: 'Confirmed',
  driver_en_route: 'Driver En Route',
  at_airport: 'At Airport',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const RIDE_STATUS_VARIANTS: Record<string, keyof typeof VARIANT_CLASSES> = {
  pending_driver: 'warning',
  confirmed: 'info',
  driver_en_route: 'info',
  at_airport: 'info',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'danger',
}

export function RideStatusBadge({ status }: { status: string }) {
  return <StatusBadge label={RIDE_STATUS_LABELS[status] ?? status} variant={RIDE_STATUS_VARIANTS[status] ?? 'neutral'} />
}
