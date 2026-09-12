export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { attachment } from '@/lib/pdf'
import { computeClassResults } from '@/lib/reports/academic'
import { renderReportCards } from '@/lib/reports/pdf'
import { teachingScope, canSeeClass } from '@/lib/teaching'

/**
 * One pupil's end-of-term report card as a PDF, built by the same engine and
 * settings as the class reports, so the card a parent gets matches the class
 * sheet the head teacher keeps.
 *
 * Staff can print any pupil in their school; a pupil can print their own. That
 * second case is why this route does its own check rather than using
 * requireApiRole — the permission depends on *which* student is asked for.
 *
 *   ?studentId=…            (optional for a pupil printing their own)
 *   ?termId=…               defaults to the latest term that has an exam for the class
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const role = session.user.role
  let schoolId = session.user.schoolId
  if (!schoolId) return NextResponse.json({ error: 'No school' }, { status: 400 })

  const staff = role === 'SCHOOL_ADMIN' || role === 'TEACHER'
  const own = await prisma.student.findFirst({ where: { userId: session.user.id, schoolId }, select: { id: true } })

  const targetId = studentId ?? own?.id
  if (!targetId) return NextResponse.json({ error: 'Student id is required' }, { status: 400 })
  if (!staff && own?.id !== targetId) {
    // A guardian may print their own children, in whichever school each child attends.
    const link = role === 'PARENT' ? await prisma.studentGuardian.findFirst({ where: { studentId: targetId, guardian: { userId: session.user.id } }, select: { student: { select: { schoolId: true } } } }) : null
    if (!link) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    schoolId = link.student.schoolId
  }

  const student = await prisma.student.findFirst({
    where: { id: targetId, schoolId },
    select: { id: true, firstName: true, lastName: true, admissionNo: true, classId: true },
  })
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  if (!student.classId) return NextResponse.json({ error: 'This pupil is not assigned to a class' }, { status: 400 })
  if (staff && role === 'TEACHER' && !canSeeClass(await teachingScope(session), student.classId)) return NextResponse.json({ error: 'This pupil is not in a class on your teaching load' }, { status: 403 })

  let termId = searchParams.get('termId')
  if (!termId) {
    const latest = await prisma.exam.findFirst({
      where: { classId: student.classId, termId: { not: null } },
      orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { termId: true },
    })
    termId = latest?.termId ?? null
    if (!termId) {
      const term = await prisma.term.findFirst({ where: { academicYear: { schoolId } }, orderBy: { startDate: 'desc' }, select: { id: true } })
      termId = term?.id ?? null
    }
  }
  if (!termId) return NextResponse.json({ error: 'No term has been set up for this school' }, { status: 400 })

  // A report card is for the parent: published mark sheets only.
  const results = await computeClassResults(schoolId, student.classId, termId, { publishedOnly: true })
  if (!results) return NextResponse.json({ error: 'Term not found' }, { status: 404 })
  if (!results.pupils.some((p) => p.studentId === student.id)) {
    return NextResponse.json({ error: 'This pupil is not active in the class' }, { status: 400 })
  }
  const bytes = await renderReportCards(results, student.id)

  // Report cards leave the building; record who produced one.
  await record(session, {
    action: 'create',
    entity: 'ReportCard',
    entityId: student.id,
    summary: `Generated a report card for ${student.firstName} ${student.lastName} (${student.admissionNo}), ${results.term.name} ${results.term.academicYear}`,
  })

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': attachment(`report-card-${student.admissionNo}-${results.term.name}.pdf`),
      'Cache-Control': 'no-store',
    },
  })
}
