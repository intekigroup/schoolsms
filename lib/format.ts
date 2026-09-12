import { SCHOOL_TIMEZONE } from '@/lib/school-time'

/**
 * Locale-aware formatting.
 *
 * The EN/SW toggle switched labels but every date and number was hardcoded to
 * `en-US`, so a Swahili user still read American month/day order and US grouping.
 * These helpers take the active locale and render in the school's timezone.
 */

/** Swahili (Tanzania) and English (Tanzania) both format d/m/y with TZS. */
function tag(locale: string) {
  return locale === 'sw' ? 'sw-TZ' : 'en-TZ'
}

/** `TZS 25,000` — whole shillings, since the currency has no practical subunit. */
export function formatMoney(amount: number, locale = 'en') {
  try {
    return new Intl.NumberFormat(tag(locale), {
      style: 'currency',
      currency: 'TZS',
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `TZS ${Math.round(amount).toLocaleString('en-GB')}`
  }
}

/** Bare grouped number, for counts and totals that already carry a unit. */
export function formatNumber(value: number, locale = 'en') {
  try {
    return new Intl.NumberFormat(tag(locale)).format(value)
  } catch {
    return String(value)
  }
}

/** `8 Sep 2026` — day first, as Tanzania writes it. */
export function formatDate(value: string | Date, locale = 'en') {
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat(tag(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: SCHOOL_TIMEZONE,
    }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/** Date with time, for audit entries and notifications. */
export function formatDateTime(value: string | Date, locale = 'en') {
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat(tag(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: SCHOOL_TIMEZONE,
    }).format(d)
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ')
  }
}
