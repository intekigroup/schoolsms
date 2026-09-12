export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'

/**
 * Teaching load: which subject a staff member teaches in which class
 * (classId null = that subject in every class), plus the class they are class
 * teacher of. This is what scopes the teacher portal.
 *
 *   GET    ?staffId                       assignments + classTeacherOf for one person
 *   POST   { staffId, subjectId, classId? }
 *   DELETE ?id
 *   PATCH  { staffId, classTeacherOf: classId | null }
 */
export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.staff)
  if (!guard.ok) return guard.response
  const staffId = new URL(req.url).searchParams.get('staffId') ?? ''
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, schoolId: guard.schoolId },
    select: { id: true, classTeacher: { select: { id: true, name: true } }, subjectAssignments: { include: { subject: { select: { id: true, name: true } }, class: { select: { id: true, name: true } } } } },
  })
  if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  return NextResponse.json({
    classTeacherOf: staff.classTeacher,
    assignments: staff.subjectAssignments.map((a) => ({ id: a.id, subjectId: a.subject.id, subject: a.subject.name, classId: a.class?.id ?? null, className: a.class?.name ?? 'All classes' })),
  })
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.staff, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = z.object({ staffId: z.string().min(1), subjectId: z.string().min(1), classId: z.string().min(1).nullable().optional() }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { staffId, subjectId, classId } = parsed.data
  const [staff, subject, cls] = await Promise.all([
    prisma.staff.findFirst({ where: { id: staffId, schoolId }, select: { id: true, firstName: true, lastName: true } }),
    prisma.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true, name: true } }),
    classId ? prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true, name: true } }) : Promise.resolve(null),
  ])
  if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
  if (classId && !cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  const dup = await prisma.staffSubject.findFirst({ where: { staffId, subjectId, classId: classId ?? null } })
  if (dup) return NextResponse.json({ error: 'Already assigned' }, { status: 409 })
  const item = await prisma.staffSubject.create({ data: { staffId, subjectId, classId: classId ?? null } })
  await record(guard.session, { action: 'create', entity: 'StaffSubject', entityId: item.id, summary: `Assigned ${subject.name} in ${cls?.name ?? 'all classes'} to ${staff.firstName} ${staff.lastName}` })
  return NextResponse.json({ item })
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.staff, req)
  if (!guard.ok) return guard.response
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const res = await prisma.staffSubject.deleteMany({ where: { id, staff: { schoolId: guard.schoolId } } })
  if (res.count === 0) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  await record(guard.session, { action: 'delete', entity: 'StaffSubject', entityId: id, summary: 'Removed a teaching assignment' })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.staff, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = z.object({ staffId: z.string().min(1), classTeacherOf: z.string().min(1).nullable() }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { staffId, classTeacherOf } = parsed.data
  const staff = await prisma.staff.findFirst({ where: { id: staffId, schoolId }, select: { id: true, firstName: true, lastName: true } })
  if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  await prisma.$transaction(async (tx) => {
    // classTeacherId is unique: one class per teacher, one teacher per class.
    await tx.class.updateMany({ where: { schoolId, classTeacherId: staffId }, data: { classTeacherId: null } })
    if (classTeacherOf) {
      const cls = await tx.class.findFirst({ where: { id: classTeacherOf, schoolId } })
      if (!cls) throw new Error('Class not found')
      await tx.class.update({ where: { id: classTeacherOf }, data: { classTeacherId: staffId } })
    }
  }).catch((e) => { throw e })
  await record(guard.session, { action: 'update', entity: 'Staff', entityId: staffId, summary: classTeacherOf ? `Made ${staff.firstName} ${staff.lastName} class teacher` : `Removed ${staff.firstName} ${staff.lastName} as class teacher` })
  return NextResponse.json({ success: true })
}
