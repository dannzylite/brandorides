import { format, isValid } from 'date-fns'

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

// Same fix as the mobile app: a Postgres DATE column has no time
// component, so `new Date("2026-07-04")` parses it as UTC midnight,
// which renders as the *previous* day in any timezone behind UTC.
export function safeFormat(value: string | null | undefined, pattern: string, fallback = '—'): string {
  if (!value) return fallback
  const match = DATE_ONLY_PATTERN.exec(value)
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value)
  return isValid(date) ? format(date, pattern) : fallback
}

export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
