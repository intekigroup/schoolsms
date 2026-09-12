export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { pageParam, limitParam, pageArgs } from '@/lib/paging'

/**
 * Staff attendance register.
 *   GET ?date=YYYY-MM-DD         the day's register (active staff, marked or not), paged by ?page&limit
 *   GET ?month=YYYY-MM           per-staff counts for the month, paged the same way
 *   PUT { date, entries: [{ staffId, status, remarks? }] }
 */
const Entry = z.object({ staffId: z.string().min(1), status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']), remarks: z.string().trim().max(120).nullable().optional() })
const Body = z.object({ date: z.string().date(), entries: z.array(Entry).min(1).max(500) })

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.hr)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date'), month = searchParams.get('month')
  const page = pageParam(searchParams), pageSize = limitParam(searchParams)
  const staffWhere = { schoolId, status: { in: ['ACTIVE', 'ON_LEAVE'] as ('ACTIVE' | 'ON_LEAVE')[] } }
  const staffPage = () => prisma.staff.findMany({ where: staffWhere, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true, employeeNo: true, role: true }, ...pageArgs(page, pageSize) })
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    const [y, m] = month.split('-').map(Number)
    const from = new Date(Date.UTC(y, m - 1, 1)), to = new Date(Date.UTC(y, m, 0, 23, 59, 59))
    const [total, staff] = await Promise.all([prisma.staff.count({ where: staffWhere }), staffPage()])
    const rows = await prisma.staffAttendance.groupBy({ by: ['staffId', 'status'], where: { staffId: { in: staff.map((s) => s.id) }, date: { gte: from, lte: to } }, _count: { _all: true } })
    return NextResponse.json({
      month, page, pageSize, total,
      staff: staff.map((s) => {
        const c = (st: string) => rows.find((r) => r.staffId === s.id && r.status === st)?._count._all ?? 0
        return { id: s.id, name: `${s.firstName} ${s.lastName}`, employeeNo: s.employeeNo, role: s.role, present: c('PRESENT'), late: c('LATE'), absent: c('ABSENT'), excused: c('EXCUSED') }
      }),
    })
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  const day = new Date(`${date}T00:00:00.000Z`)
  const [total, staff] = await Promise.all([prisma.staff.count({ where: staffWhere }), staffPage()])
  const ids = staff.map((s) => s.id)
  const [marks, onLeave] = await Promise.all([
    prisma.staffAttendance.findMany({ where: { staffId: { in: ids }, date: day }, select: { staffId: true, status: true, remarks: true } }),
    prisma.leaveRequest.findMany({ where: { staffId: { in: ids }, status: 'APPROVED', startDate: { lte: day }, endDate: { gte: day } }, select: { staffId: true, type: true } }),
  ])
  return NextResponse.json({
    date, page, pageSize, total,
    staff: staff.map((s) => {
      const m = marks.find((x) => x.staffId === s.id)
      const l = onLeave.find((x) => x.staffId === s.id)
      return { id: s.id, name: `${s.firstName} ${s.lastName}`, employeeNo: s.employeeNo, role: s.role, status: m?.status ?? null, remarks: m?.remarks ?? null, onLeave: l?.type ?? null }
    }),
  })
}

export async function PUT(req: Request) {
  const guard = await requireApiRole(ROLES.hr, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { date, entries } = parsed.data
  const day = new Date(`${date}T00:00:00.000Z`)
  const ids = [...new Set(entries.map((e) => e.staffId))]
  const owned = await prisma.staff.count({ where: { id: { in: ids }, schoolId } })
  if (owned !== ids.length) return NextResponse.json({ error: 'One or more staff are not in your school' }, { status: 404 })
  await prisma.$transaction(entries.map((e) => prisma.staffAttendance.upsert({
    where: { staffId_date: { staffId: e.staffId, date: day } },
    update: { status: e.status, remarks: e.remarks || null },
    create: { staffId: e.staffId, date: day, status: e.status, remarks: e.remarks || null },
  })))
  await record(guard.session, { action: 'update', entity: 'StaffAttendance', entityId: date, summary: `Marked staff attendance for ${entries.length} staff on ${date}` })
  return NextResponse.json({ success: true, saved: entries.length })
}
