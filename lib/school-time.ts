/**
 * Civil-day helpers pinned to the school's timezone.
 *
 * "Today" was previously computed with `new Date().setHours(0,0,0,0)`, which uses
 * the SERVER's timezone. Deployed on a UTC host, a Tanzanian school's 00:00–03:00
 * still counted as the previous day — and since attendance is keyed
 * `@@unique([studentId, date])`, that silently wrote to the wrong day's record.
 *
 * Set SCHOOL_TIMEZONE in .env (IANA name). Defaults to Africa/Dar_es_Salaam,
 * the market this product targets.
 */

export const SCHOOL_TIMEZONE = process.env.SCHOOL_TIMEZONE || 'Africa/Dar_es_Salaam'

/** The current civil date in the school's timezone, as `yyyy-mm-dd`. */
export function schoolToday(now: Date = new Date()): string {
  // en-CA formats as yyyy-mm-dd.
  return now.toLocaleDateString('en-CA', { timeZone: SCHOOL_TIMEZONE })
}

/**
 * Midnight UTC of a `yyyy-mm-dd` civil date — the canonical instant this codebase
 * already stores date-only values at (`new Date('2026-03-02')`), so attendance
 * keys stay consistent with existing rows.
 */
export function civilDayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

/** Start of today in the school's timezone, as a stored Date. */
export function schoolTodayStart(now: Date = new Date()): Date {
  return civilDayToDate(schoolToday(now))
}

/** Exclusive end of today in the school's timezone. */
export function schoolTodayEnd(now: Date = new Date()): Date {
  const start = schoolTodayStart(now)
  return new Date(start.getTime() + 24 * 60 * 60 * 1000)
}
