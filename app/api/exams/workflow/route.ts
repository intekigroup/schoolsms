export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { teachingScope, canTeach, classFilter } from '@/lib/teaching'

/**
 * Mark-sheet workflow.
 *   GET   ?termId                     board: every exam in the term (teachers: those they teach) with progress and status
 *   PATCH { examId, action, note?, force? }
 *       submit   teacher/admin, DRAFT → SUBMITTED; refused while marks are missing unless `force`
 *       reject   admin, SUBMITTED → DRAFT with a note for the teacher
 *       publish  admin, SUBMITTED (or DRAFT with force) → PUBLISHED; marks now count on report cards and portals
 *       reopen   admin, PUBLISHED/SUBMITTED → DRAFT
 *       publish-term  admin: publish every SUBMITTED exam in ?termId in one go
 */
const Body = z.object({ examId: z.string().min(1).optional(), termId: z.string().min(1).optional(), action: z.enum(['submit', 'reject', 'publish', 'reopen', 'publish-term']), note: z.string().trim().max(300).optional(), force: z.boolean().optional() })

async function notify(userIds: string[], title: string, message: string) {
  const ids = [...new Set(userIds)].filter(Boolean)
  if (ids.length) await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title, message })) })
}

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.exams)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const termId = new URL(req.url).searchParams.get('termId')
  if (!termId) return NextResponse.json({ error: 'termId is required' }, { status: 400 })
  const scope = await teachingScope(guard.session)
  const exams = await prisma.exam.findMany({
    where: { termId, class: { schoolId, ...classFilter(scope) } },
    include: { class: { select: { id: true, name: true, _count: { select: { students: { where: { status: 'ACTIVE' } } } } } }, subject: { select: { id: true, name: true } }, _count: { select: { results: true } } },
    orderBy: [{ class: { name: 'asc' } }, { subject: { name: 'asc' } }, { date: 'asc' }],
  })
  const rows = exams.filter((e) => canTeach(scope, e.classId, e.subjectId)).map((e) => ({
    id: e.id, name: e.name, type: e.type, classId: e.classId, className: e.class.name, subjectId: e.subjectId, subjectName: e.subject.name,
    entered: e._count.results, expected: e.class._count.students, status: e.status, submittedAt: e.submittedAt, publishedAt: e.publishedAt, reviewNote: e.reviewNote,
  }))
  const tally = (s: string) => rows.filter((r) => r.status === s).length
  return NextResponse.json({ exams: rows, summary: { total: rows.length, draft: tally('DRAFT'), submitted: tally('SUBMITTED'), published: tally('PUBLISHED'), incomplete: rows.filter((r) => r.status === 'DRAFT' && r.entered < r.expected).length } })
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.exams, req)
  if (!guard.ok) return guard.response
  const { schoolId, session } = guard
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { examId, termId, action, note, force } = parsed.data
  const scope = await teachingScope(session)
  const isAdmin = scope.all

  if (action === 'publish-term') {
    if (!isAdmin) return NextResponse.json({ error: 'Only the office publishes results' }, { status: 403 })
    if (!termId) return NextResponse.json({ error: 'termId is required' }, { status: 400 })
    const term = await prisma.term.findFirst({ where: { id: termId, academicYear: { schoolId } }, select: { name: true } })
    if (!term) return NextResponse.json({ error: 'Term not found' }, { status: 404 })
    const res = await prisma.exam.updateMany({ where: { termId, status: 'SUBMITTED', class: { schoolId } }, data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: session.user.id } })
    await record(session, { action: 'update', entity: 'Exam', entityId: termId, summary: `Published ${res.count} submitted mark sheet(s) for ${term.name}` })
    return NextResponse.json({ published: res.count })
  }

  if (!examId) return NextResponse.json({ error: 'examId is required' }, { status: 400 })
  const exam = await prisma.exam.findFirst({ where: { id: examId, class: { schoolId } }, include: { class: { select: { name: true, _count: { select: { students: { where: { status: 'ACTIVE' } } } } } }, subject: { select: { name: true } }, _count: { select: { results: true } } } })
  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
  if (!canTeach(scope, exam.classId, exam.subjectId)) return NextResponse.json({ error: 'You do not teach this subject in this class' }, { status: 403 })
  const label = `${exam.name} · ${exam.class.name} · ${exam.subject.name}`
  const admins = async () => (await prisma.user.findMany({ where: { schoolId, role: 'SCHOOL_ADMIN', isActive: true }, select: { id: true } })).map((u) => u.id)
  const teacherUser = async () => {
    const t = await prisma.staffSubject.findFirst({ where: { subjectId: exam.subjectId, OR: [{ classId: exam.classId }, { classId: null }], staff: { userId: { not: null } } }, select: { staff: { select: { userId: true } } } })
    return t?.staff.userId ? [t.staff.userId] : []
  }
  const missing = exam.class._count.students - exam._count.results

  if (action === 'submit') {
    if (exam.status !== 'DRAFT') return NextResponse.json({ error: 'Only a draft mark sheet can be submitted' }, { status: 400 })
    if (missing > 0 && !force) return NextResponse.json({ error: `${missing} pupil(s) have no mark yet. Enter them, or submit anyway to record them as not assessed.`, missing }, { status: 409 })
    await prisma.exam.update({ where: { id: examId }, data: { status: 'SUBMITTED', submittedAt: new Date(), submittedById: session.user.id, reviewNote: null } })
    await record(session, { action: 'update', entity: 'Exam', entityId: examId, summary: `Submitted marks for ${label} (${exam._count.results}/${exam.class._count.students})` })
    await notify(await admins(), 'Marks submitted for review', `${label} — ${exam._count.results} of ${exam.class._count.students} marks entered by ${session.user.name}.`)
  } else if (action === 'reject') {
    if (!isAdmin) return NextResponse.json({ error: 'Only the office reviews mark sheets' }, { status: 403 })
    if (exam.status !== 'SUBMITTED') return NextResponse.json({ error: 'Only a submitted mark sheet can be returned' }, { status: 400 })
    await prisma.exam.update({ where: { id: examId }, data: { status: 'DRAFT', reviewNote: note || 'Returned for correction', submittedAt: null } })
    await record(session, { action: 'update', entity: 'Exam', entityId: examId, summary: `Returned marks for ${label}: ${note || 'for correction'}` })
    await notify(await teacherUser(), 'Mark sheet returned', `${label}: ${note || 'Please check and resubmit.'}`)
  } else if (action === 'publish') {
    if (!isAdmin) return NextResponse.json({ error: 'Only the office publishes results' }, { status: 403 })
    if (exam.status === 'PUBLISHED') return NextResponse.json({ error: 'Already published' }, { status: 400 })
    if (exam.status === 'DRAFT' && !force) return NextResponse.json({ error: 'This sheet has not been submitted. Publish anyway?', unsubmitted: true }, { status: 409 })
    await prisma.exam.update({ where: { id: examId }, data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: session.user.id, submittedAt: exam.submittedAt ?? new Date() } })
    await record(session, { action: 'update', entity: 'Exam', entityId: examId, summary: `Published marks for ${label}` })
    // Parents and pupils of the class with logins hear that results are out.
    const pupils = await prisma.student.findMany({ where: { classId: exam.classId, status: 'ACTIVE' }, select: { userId: true, guardians: { select: { guardian: { select: { userId: true } } } } } })
    await notify([...pupils.map((p) => p.userId), ...pupils.flatMap((p) => p.guardians.map((g) => g.guardian.userId))].filter((x): x is string => !!x), 'Results published', `${exam.subject.name} — ${exam.name} results for ${exam.class.name} are now on the portal.`)
  } else if (action === 'reopen') {
    if (!isAdmin) return NextResponse.json({ error: 'Only the office can reopen a mark sheet' }, { status: 403 })
    if (exam.status === 'DRAFT') return NextResponse.json({ error: 'Already open' }, { status: 400 })
    await prisma.exam.update({ where: { id: examId }, data: { status: 'DRAFT', publishedAt: null, publishedById: null, submittedAt: null, reviewNote: note || null } })
    await record(session, { action: 'update', entity: 'Exam', entityId: examId, summary: `Reopened marks for ${label}${note ? `: ${note}` : ''}` })
    await notify(await teacherUser(), 'Mark sheet reopened', `${label} is open for editing again${note ? `: ${note}` : '.'}`)
  }
  const updated = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, status: true, submittedAt: true, publishedAt: true, reviewNote: true } })
  return NextResponse.json({ exam: updated })
}
