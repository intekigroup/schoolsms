export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { loadHrConfig } from '@/lib/hr/settings'
import { leaveBalances, workingDaysBetween } from '@/lib/hr/leave'
import { pageParam, limitParam, pageArgs } from '@/lib/paging'

/**
 * Leave requests.
 *   GET  ?status=&staffId=&year=&page=&limit=   admin: the school's requests; others: their own (one page + total)
 *   GET  ?balances=1&staffId=&year=    entitlement vs taken per type
 *   POST { staffId?, type, startDate, endDate, reason }   staff request their own; admin may request on behalf
 *   PATCH { id, action: approve|reject|cancel, note? }    approve/reject = admin; cancel = owner (pending) or admin
 */
const Create = z.object({ staffId: z.string().optional(), type: z.string().min(1), startDate: z.string().date(), endDate: z.string().date(), reason: z.string().trim().min(3).max(300) })
const Review = z.object({ id: z.string().min(1), action: z.enum(['approve', 'reject', 'cancel']), note: z.string().trim().max(200).optional() })

async function ownStaff(userId: string, schoolId: string) {
  return prisma.staff.findFirst({ where: { userId, schoolId }, select: { id: true, firstName: true, lastName: true } })
}

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.hrSelf)
  if (!guard.ok) return guard.response
  const { schoolId, session } = guard
  const isAdmin = session.user.role === 'SCHOOL_ADMIN'
  const { searchParams } = new URL(req.url)
  const config = await loadHrConfig(schoolId)
  const own = isAdmin ? null : await ownStaff(session.user.id, schoolId)
  if (!isAdmin && !own) return NextResponse.json({ error: 'No staff record is linked to your account' }, { status: 404 })
  const staffId = isAdmin ? searchParams.get('staffId') : own!.id
  const year = Number(searchParams.get('year') ?? new Date().getUTCFullYear())

  if (searchParams.get('balances') === '1') {
    if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
    const s = await prisma.staff.findFirst({ where: { id: staffId, schoolId }, select: { id: true } })
    if (!s) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    return NextResponse.json({ year, balances: await leaveBalances(staffId, year, config) })
  }
  const status = searchParams.get('status')
  const page = pageParam(searchParams), pageSize = limitParam(searchParams)
  const where = { staff: { schoolId }, ...(staffId ? { staffId } : {}), ...(status ? { status: status as any } : {}), startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } }
  const [total, rows] = await Promise.all([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      ...pageArgs(page, pageSize),
      include: { staff: { select: { firstName: true, lastName: true, employeeNo: true, role: true } } },
    }),
  ])
  return NextResponse.json({
    year, leaveTypes: config.leaveTypes, page, pageSize, total,
    requests: rows.map((r) => ({
      id: r.id, staffId: r.staffId, staffName: `${r.staff.firstName} ${r.staff.lastName}`, employeeNo: r.staff.employeeNo, role: r.staff.role,
      type: r.type, typeName: config.leaveTypes.find((t) => t.key === r.type)?.name ?? r.type, startDate: r.startDate, endDate: r.endDate, days: r.days,
      reason: r.reason, status: r.status, reviewNote: r.reviewNote, reviewedAt: r.reviewedAt, createdAt: r.createdAt,
    })),
  })
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.hrSelf, req)
  if (!guard.ok) return guard.response
  const { schoolId, session } = guard
  const parsed = Create.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` }, { status: 400 })
  const { type, startDate, endDate, reason } = parsed.data
  const isAdmin = session.user.role === 'SCHOOL_ADMIN'
  const own = await ownStaff(session.user.id, schoolId)
  const staffId = isAdmin && parsed.data.staffId ? parsed.data.staffId : own?.id
  if (!staffId) return NextResponse.json({ error: 'No staff record is linked to your account' }, { status: 404 })
  const staff = await prisma.staff.findFirst({ where: { id: staffId, schoolId }, select: { id: true, firstName: true, lastName: true } })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  const config = await loadHrConfig(schoolId)
  const lt = config.leaveTypes.find((t) => t.key === type)
  if (!lt) return NextResponse.json({ error: 'Unknown leave type' }, { status: 400 })
  const start = new Date(`${startDate}T00:00:00.000Z`), end = new Date(`${endDate}T00:00:00.000Z`)
  if (end < start) return NextResponse.json({ error: 'End date is before the start date' }, { status: 400 })
  const days = workingDaysBetween(start, end, config.workingDays)
  if (days === 0) return NextResponse.json({ error: 'The dates contain no working days' }, { status: 400 })
  const overlap = await prisma.leaveRequest.count({ where: { staffId, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: end }, endDate: { gte: start } } })
  if (overlap) return NextResponse.json({ error: 'These dates overlap an existing request' }, { status: 409 })
  if (lt.daysPerYear > 0) {
    const bal = (await leaveBalances(staffId, start.getUTCFullYear(), config)).find((b) => b.key === type)!
    if (bal.remaining !== null && days > bal.remaining) {
      return NextResponse.json({ error: `Only ${bal.remaining} day(s) of ${lt.name.toLowerCase()} remain this year; ${days} requested` }, { status: 400 })
    }
  }
  const row = await prisma.leaveRequest.create({ data: { staffId, type, startDate: start, endDate: end, days, reason } })
  await record(session, { action: 'create', entity: 'LeaveRequest', entityId: row.id, summary: `${isAdmin && parsed.data.staffId ? 'Recorded' : 'Requested'} ${days} day(s) ${lt.name.toLowerCase()} for ${staff.firstName} ${staff.lastName} (${startDate} to ${endDate})` })
  return NextResponse.json({ request: row })
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.hrSelf, req)
  if (!guard.ok) return guard.response
  const { schoolId, session } = guard
  const parsed = Review.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { id, action, note } = parsed.data
  const isAdmin = session.user.role === 'SCHOOL_ADMIN'
  const row = await prisma.leaveRequest.findFirst({ where: { id, staff: { schoolId } }, include: { staff: { select: { userId: true, firstName: true, lastName: true } } } })
  if (!row) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (action === 'cancel') {
    const owner = row.staff.userId === session.user.id
    if (!isAdmin && !owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (row.status !== 'PENDING' && !isAdmin) return NextResponse.json({ error: 'Only a pending request can be cancelled' }, { status: 400 })
    if (row.status === 'CANCELLED' || row.status === 'REJECTED') return NextResponse.json({ error: 'Request is already closed' }, { status: 400 })
  } else {
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (row.status !== 'PENDING') return NextResponse.json({ error: 'Only a pending request can be reviewed' }, { status: 400 })
  }
  const status = action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'CANCELLED'
  const updated = await prisma.leaveRequest.update({ where: { id }, data: { status, reviewedById: session.user.id, reviewedAt: new Date(), reviewNote: note || null } })
  await record(session, { action: 'update', entity: 'LeaveRequest', entityId: id, summary: `${action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Cancelled'} ${row.days} day(s) leave for ${row.staff.firstName} ${row.staff.lastName}` })
  return NextResponse.json({ request: updated })
}
