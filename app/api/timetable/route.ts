export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { teachingScope, canSeeClass, viewerClasses, isViewerRole } from '@/lib/teaching'

/**
 * Timetable slots.
 *   GET    ?classId | ?staffId          slots for a class or a teacher (teachers: own scope only)
 *   POST   { classId, dayOfWeek, startTime, endTime, subjectId, staffId?, room?, force? }
 *   PATCH  { id, dayOfWeek?, startTime?, endTime?, subjectId?, staffId?, room?, force?, swap? }
 *          — move a slot by drag; `swap` exchanges places with the slot already in the target cell
 *   DELETE ?id
 *
 * A teacher cannot be in two classes at once: creating or moving a slot into a
 * cell where the teacher already teaches another class is refused with 409
 * and the clash, unless `force` is set (cover, split classes).
 */
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const Create = z.object({ classId: z.string().min(1), dayOfWeek: z.number().int().min(1).max(7), startTime: z.string().regex(TIME), endTime: z.string().regex(TIME), subjectId: z.string().min(1), staffId: z.string().nullable().optional(), room: z.string().trim().max(30).nullable().optional(), force: z.boolean().optional() })
const Update = z.object({ id: z.string().min(1), dayOfWeek: z.number().int().min(1).max(7).optional(), startTime: z.string().regex(TIME).optional(), endTime: z.string().regex(TIME).optional(), subjectId: z.string().min(1).optional(), staffId: z.string().nullable().optional(), room: z.string().trim().max(30).nullable().optional(), force: z.boolean().optional(), swap: z.boolean().optional() })

async function clash(schoolId: string, staffId: string | null | undefined, dayOfWeek: number, startTime: string, exceptSlotId?: string) {
  if (!staffId) return null
  const other = await prisma.timetableSlot.findFirst({
    where: { staffId, dayOfWeek, startTime, class: { schoolId }, ...(exceptSlotId ? { id: { not: exceptSlotId } } : {}) },
    include: { class: { select: { name: true } }, subject: { select: { name: true } }, staff: { select: { firstName: true, lastName: true } } },
  })
  if (!other) return null
  return `${other.staff?.firstName} ${other.staff?.lastName} already teaches ${other.subject?.name ?? 'a lesson'} to ${other.class.name} at ${startTime}`
}

const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.timetableRead)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('classId'), staffId = searchParams.get('staffId')
  if (isViewerRole(guard.role)) {
    // A pupil or a guardian: only the class(es) they belong to, never by teacher.
    const mine = await viewerClasses(guard.session)
    if (!classId || !mine.some((c) => c.id === classId)) return NextResponse.json({ error: 'You can only view your own class timetable' }, { status: 403 })
    const slots = await prisma.timetableSlot.findMany({ where: { classId }, include: { class: { select: { name: true } }, subject: { select: { name: true } }, staff: { select: { firstName: true, lastName: true } } }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] })
    return NextResponse.json({ slots: slots.map((s) => ({ id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, room: s.room ?? '', classId: s.classId, className: s.class.name, subjectId: s.subjectId, subjectName: s.subject?.name ?? '', staffId: s.staffId, teacherName: s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : '' })) })
  }
  const scope = await teachingScope(guard.session)
  if (classId && !canSeeClass(scope, classId)) return NextResponse.json({ error: 'This class is not on your teaching load' }, { status: 403 })
  if (staffId && !scope.all && staffId !== scope.staffId) return NextResponse.json({ error: 'You can only view your own timetable' }, { status: 403 })
  const slots = await prisma.timetableSlot.findMany({
    where: { class: { schoolId }, ...(classId ? { classId } : {}), ...(staffId ? { staffId } : {}) },
    include: { class: { select: { name: true } }, subject: { select: { name: true } }, staff: { select: { firstName: true, lastName: true } } },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })
  return NextResponse.json({ slots: slots.map((s) => ({ id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, room: s.room ?? '', classId: s.classId, className: s.class.name, subjectId: s.subjectId, subjectName: s.subject?.name ?? '', staffId: s.staffId, teacherName: s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : '' })) })
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.timetableWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = Create.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` }, { status: 400 })
  const { classId, dayOfWeek, startTime, endTime, subjectId, staffId, room, force } = parsed.data
  const [cls, subject, staff] = await Promise.all([
    prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true, name: true } }),
    prisma.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true, name: true } }),
    staffId ? prisma.staff.findFirst({ where: { id: staffId, schoolId }, select: { id: true } }) : Promise.resolve(null),
  ])
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
  if (staffId && !staff) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
  if (endTime <= startTime) return NextResponse.json({ error: 'End time must be after the start time' }, { status: 400 })
  if (!force) { const c = await clash(schoolId, staffId, dayOfWeek, startTime); if (c) return NextResponse.json({ error: c, clash: true }, { status: 409 }) }
  // One lesson per cell: replace whatever was there.
  await prisma.timetableSlot.deleteMany({ where: { classId, dayOfWeek, startTime } })
  const slot = await prisma.timetableSlot.create({ data: { classId, dayOfWeek, startTime, endTime, subjectId, staffId: staffId || null, room: room || null } })
  await record(guard.session, { action: 'create', entity: 'TimetableSlot', entityId: slot.id, summary: `Timetabled ${subject.name} for ${cls.name} on ${DAY[dayOfWeek]} ${startTime}` })
  return NextResponse.json({ success: true, slot })
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.timetableWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = Update.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` }, { status: 400 })
  const { id, force, swap, ...patch } = parsed.data
  const slot = await prisma.timetableSlot.findFirst({ where: { id, class: { schoolId } }, include: { class: { select: { name: true } }, subject: { select: { name: true } } } })
  if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
  if (patch.subjectId) { const s = await prisma.subject.findFirst({ where: { id: patch.subjectId, schoolId } }); if (!s) return NextResponse.json({ error: 'Subject not found' }, { status: 404 }) }
  if (patch.staffId) { const s = await prisma.staff.findFirst({ where: { id: patch.staffId, schoolId } }); if (!s) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 }) }
  const next = { dayOfWeek: patch.dayOfWeek ?? slot.dayOfWeek, startTime: patch.startTime ?? slot.startTime, endTime: patch.endTime ?? slot.endTime, staffId: patch.staffId === undefined ? slot.staffId : patch.staffId }
  if (next.endTime <= next.startTime) return NextResponse.json({ error: 'End time must be after the start time' }, { status: 400 })
  const moving = next.dayOfWeek !== slot.dayOfWeek || next.startTime !== slot.startTime

  const occupant = moving ? await prisma.timetableSlot.findFirst({ where: { classId: slot.classId, dayOfWeek: next.dayOfWeek, startTime: next.startTime, id: { not: id } } }) : null
  if (occupant && !swap) return NextResponse.json({ error: 'That period already has a lesson. Drop onto it to swap, or clear it first.', occupied: true }, { status: 409 })
  if (!force) {
    const c = await clash(schoolId, next.staffId, next.dayOfWeek, next.startTime, id)
    if (c) return NextResponse.json({ error: c, clash: true }, { status: 409 })
    if (occupant && occupant.staffId) {
      const c2 = await clash(schoolId, occupant.staffId, slot.dayOfWeek, slot.startTime, occupant.id)
      if (c2) return NextResponse.json({ error: `Swapping would clash: ${c2}`, clash: true }, { status: 409 })
    }
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (occupant) await tx.timetableSlot.update({ where: { id: occupant.id }, data: { dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime } })
    return tx.timetableSlot.update({ where: { id }, data: { ...next, subjectId: patch.subjectId ?? slot.subjectId, room: patch.room === undefined ? slot.room : patch.room || null } })
  })
  await record(guard.session, { action: 'update', entity: 'TimetableSlot', entityId: id, summary: moving ? `Moved ${slot.subject?.name ?? 'lesson'} for ${slot.class.name} to ${DAY[next.dayOfWeek]} ${next.startTime}${occupant ? ' (swapped)' : ''}` : `Edited ${slot.subject?.name ?? 'lesson'} for ${slot.class.name}` })
  return NextResponse.json({ success: true, slot: updated, swappedWith: occupant?.id ?? null })
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.timetableWrite, req)
  if (!guard.ok) return guard.response
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const slot = await prisma.timetableSlot.findFirst({ where: { id, class: { schoolId: guard.schoolId } }, include: { class: { select: { name: true } }, subject: { select: { name: true } } } })
  if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
  await prisma.timetableSlot.delete({ where: { id } })
  await record(guard.session, { action: 'delete', entity: 'TimetableSlot', entityId: id, summary: `Cleared ${slot.subject?.name ?? 'lesson'} for ${slot.class.name} on ${DAY[slot.dayOfWeek]} ${slot.startTime}` })
  return NextResponse.json({ success: true })
}
