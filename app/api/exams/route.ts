export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { teachingScope, canTeach } from '@/lib/teaching'

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.exams, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    if (!body.classId || !body.subjectId || !body.academicYearId) {
      return NextResponse.json({ error: 'Class, subject and academic year are required' }, { status: 400 })
    }
    // Tenant isolation: every referenced record must belong to the caller's school.
    const [cls, subject, year, term] = await Promise.all([
      prisma.class.findFirst({ where: { id: body.classId, schoolId }, select: { id: true } }),
      prisma.subject.findFirst({ where: { id: body.subjectId, schoolId }, select: { id: true } }),
      prisma.academicYear.findFirst({ where: { id: body.academicYearId, schoolId }, select: { id: true } }),
      body.termId
        ? prisma.term.findFirst({ where: { id: body.termId, academicYear: { schoolId } }, select: { id: true } })
        : Promise.resolve(null),
    ])
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    if (!year) return NextResponse.json({ error: 'Academic year not found' }, { status: 404 })
    if (body.termId && !term) return NextResponse.json({ error: 'Term not found' }, { status: 404 })
    if (!canTeach(await teachingScope(guard.session), body.classId, body.subjectId)) return NextResponse.json({ error: 'You do not teach this subject in this class' }, { status: 403 })

    const exam = await prisma.exam.create({
      data: {
        name: body.name ?? 'Unnamed Exam',
        type: body.type ?? 'CAT',
        totalMarks: body.totalMarks ?? 100,
        classId: body.classId,
        subjectId: body.subjectId,
        academicYearId: body.academicYearId,
        termId: body.termId ?? null,
        date: body.date ? new Date(body.date) : null,
      },
    })
    return NextResponse.json(exam)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
