export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { teachingScope, canTeach, classFilter, canSeeClass } from '@/lib/teaching'

/**
 * Homework and lesson notes.
 *   GET    ?classId&from&to        staff: their classes; guardians: their children's classes; pupils: own class
 *   POST   { classId, subjectId?, kind, title, description, dueDate?, visibleToGuardians? }   teacher of the class/subject, or office
 *   PATCH  { id, ...same }         author, or office
 *   DELETE ?id                     author, or office
 * Guardians and pupils with logins are notified when homework is posted.
 */
const Body = z.object({ classId: z.string().min(1), subjectId: z.string().min(1).nullable().optional(), kind: z.enum(['HOMEWORK', 'NOTE']).default('HOMEWORK'), title: z.string().trim().min(2).max(120), description: z.string().trim().min(1).max(4000), dueDate: z.string().date().nullable().optional(), visibleToGuardians: z.boolean().optional() })

const shape = (a: any) => ({ id: a.id, classId: a.classId, className: a.class?.name ?? '', subjectId: a.subjectId, subjectName: a.subject?.name ?? null, kind: a.kind, title: a.title, description: a.description, dueDate: a.dueDate, visibleToGuardians: a.visibleToGuardians, teacher: a.staff ? `${a.staff.firstName} ${a.staff.lastName}` : null, staffId: a.staffId, createdById: a.createdById, createdAt: a.createdAt })
const include = { class: { select: { name: true } }, subject: { select: { name: true } }, staff: { select: { firstName: true, lastName: true } } }

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const schoolId = session.user.schoolId
  if (!schoolId) return NextResponse.json({ error: 'No school' }, { status: 400 })
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('classId'), from = searchParams.get('from'), to = searchParams.get('to')
  const role = session.user.role
  let classIds: string[] | null = null // null = every class in the school
  let guardianView = false
  if (role === 'PARENT') {
    guardianView = true
    const g = await prisma.guardian.findFirst({ where: { userId: session.user.id }, select: { students: { select: { student: { select: { classId: true, schoolId: true } } } } } })
    classIds = (g?.students ?? []).map((s) => s.student).filter((s) => s.schoolId === schoolId && s.classId).map((s) => s.classId as string)
  } else if (role === 'STUDENT') {
    guardianView = true
    const s = await prisma.student.findFirst({ where: { userId: session.user.id, schoolId }, select: { classId: true } })
    classIds = s?.classId ? [s.classId] : []
  } else if (role === 'TEACHER' || role === 'SCHOOL_ADMIN') {
    const scope = await teachingScope(session)
    classIds = scope.all ? null : scope.classIds
  } else return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (classIds && classIds.length === 0) return NextResponse.json({ assignments: [] })
  if (classId && classIds && !classIds.includes(classId)) return NextResponse.json({ error: 'Not your class' }, { status: 403 })
  const rows = await prisma.assignment.findMany({
    where: {
      schoolId, ...(classId ? { classId } : classIds ? { classId: { in: classIds } } : {}),
      ...(guardianView ? { visibleToGuardians: true } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59Z`) } : {}) } } : {}),
    },
    orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }], take: 200, include,
  })
  return NextResponse.json({ assignments: rows.map(shape) })
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.homework, req)
  if (!guard.ok) return guard.response
  const { schoolId, session } = guard
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` }, { status: 400 })
  const { classId, subjectId, kind, title, description, dueDate, visibleToGuardians } = parsed.data
  const scope = await teachingScope(session)
  const cls = await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true, name: true } })
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  if (subjectId) {
    const sub = await prisma.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true } })
    if (!sub) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    if (!canTeach(scope, classId, subjectId)) return NextResponse.json({ error: 'You do not teach this subject in this class' }, { status: 403 })
  } else if (!scope.all && !scope.classIds.includes(classId)) return NextResponse.json({ error: 'This class is not on your teaching load' }, { status: 403 })
  const row = await prisma.assignment.create({
    data: { schoolId, classId, subjectId: subjectId ?? null, staffId: scope.staffId, kind, title, description, dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : null, visibleToGuardians: visibleToGuardians ?? true, createdById: session.user.id },
    include,
  })
  await record(session, { action: 'create', entity: 'Assignment', entityId: row.id, summary: `Posted ${kind === 'HOMEWORK' ? 'homework' : 'a lesson note'} "${title}" for ${cls.name}` })
  if (row.visibleToGuardians) {
    const pupils = await prisma.student.findMany({ where: { classId, status: 'ACTIVE' }, select: { userId: true, guardians: { select: { guardian: { select: { userId: true } } } } } })
    const ids = [...new Set([...pupils.map((p) => p.userId), ...pupils.flatMap((p) => p.guardians.map((g) => g.guardian.userId))].filter((x): x is string => !!x))]
    if (ids.length) await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title: kind === 'HOMEWORK' ? `Homework: ${title}` : `Lesson note: ${title}`, message: `${cls.name}${row.subject ? ` · ${row.subject.name}` : ''}${dueDate ? ` · due ${dueDate}` : ''} — ${description.slice(0, 140)}` })) })
  }
  return NextResponse.json({ assignment: shape(row) })
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.homework, req)
  if (!guard.ok) return guard.response
  const { schoolId, session } = guard
  const parsed = Body.partial().extend({ id: z.string().min(1) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { id, dueDate, ...rest } = parsed.data
  const existing = await prisma.assignment.findFirst({ where: { id, schoolId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const scope = await teachingScope(session)
  if (!scope.all && existing.createdById !== session.user.id) return NextResponse.json({ error: 'Only the author or the office can edit this' }, { status: 403 })
  if (rest.classId && rest.classId !== existing.classId) {
    const cls = await prisma.class.findFirst({ where: { id: rest.classId, schoolId }, select: { id: true } })
    if (!cls || !canSeeClass(scope, rest.classId)) return NextResponse.json({ error: 'Class not found' }, { status: 400 })
  }
  const row = await prisma.assignment.update({ where: { id }, data: { ...rest, classId: rest.classId ?? existing.classId, dueDate: dueDate === undefined ? undefined : dueDate ? new Date(`${dueDate}T00:00:00Z`) : null }, include })
  await record(session, { action: 'update', entity: 'Assignment', entityId: id, summary: `Edited "${row.title}"` })
  return NextResponse.json({ assignment: shape(row) })
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.homework, req)
  if (!guard.ok) return guard.response
  const { schoolId, session } = guard
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const existing = await prisma.assignment.findFirst({ where: { id, schoolId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const scope = await teachingScope(session)
  if (!scope.all && existing.createdById !== session.user.id) return NextResponse.json({ error: 'Only the author or the office can delete this' }, { status: 403 })
  await prisma.assignment.delete({ where: { id } })
  await record(session, { action: 'delete', entity: 'Assignment', entityId: id, summary: `Removed "${existing.title}"` })
  return NextResponse.json({ success: true })
}
