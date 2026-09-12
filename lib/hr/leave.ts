import { prisma } from '@/lib/db'
import type { HrConfig } from './settings'

/** Working days between two dates inclusive, honouring the school's working week. */
export function workingDaysBetween(start: Date, end: Date, workingDays: number[]): number {
  const set = new Set(workingDays)
  let n = 0
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  while (d.getTime() <= last) {
    const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
    if (set.has(iso)) n += 1
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}

export interface LeaveBalance { key: string; name: string; entitlement: number; taken: number; pending: number; remaining: number | null; paid: boolean }

/** Approved and pending days per leave type for one staff member in a calendar year. */
export async function leaveBalances(staffId: string, year: number, config: HrConfig): Promise<LeaveBalance[]> {
  const from = new Date(Date.UTC(year, 0, 1)), to = new Date(Date.UTC(year, 11, 31, 23, 59, 59))
  const rows = await prisma.leaveRequest.findMany({
    where: { staffId, startDate: { gte: from, lte: to }, status: { in: ['APPROVED', 'PENDING'] } },
    select: { type: true, days: true, status: true },
  })
  return config.leaveTypes.map((t) => {
    const taken = rows.filter((r) => r.type === t.key && r.status === 'APPROVED').reduce((s, r) => s + r.days, 0)
    const pending = rows.filter((r) => r.type === t.key && r.status === 'PENDING').reduce((s, r) => s + r.days, 0)
    return { key: t.key, name: t.name, entitlement: t.daysPerYear, taken, pending, remaining: t.daysPerYear > 0 ? t.daysPerYear - taken : null, paid: t.paid }
  })
}
