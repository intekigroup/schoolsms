export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from "@/lib/audit"
import { gradeFor, loadReportConfig } from "@/lib/reports/settings"
import { teachingScope, canTeach } from '@/lib/teaching'

// Grades follow the scale the school set under Settings → Reports.
function computeGrade(marks: number, total: number, scale: Awaited<ReturnType<typeof loadReportConfig>>["scale"]): string {
  const pct = total > 0 ? (marks / total) * 100 : 0
  return gradeFor(Math.max(0, Math.min(100, pct)), scale).grade
}

// POST: bulk save exam results
export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.exams, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const { examId, results } = await req.json()
    if (!examId || !results?.length) return NextResponse.json({ error: 'examId and results required' }, { status: 400 })
    const exam = await prisma.exam.findFirst({ where: { id: examId, class: { schoolId } } })
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 })
    const scope = await teachingScope(guard.session)
    if (!canTeach(scope, exam.classId, exam.subjectId)) return NextResponse.json({ error: 'You do not teach this subject in this class' }, { status: 403 })
    // Workflow lock: submitted sheets are the office's to correct; published sheets must be reopened first.
    if (exam.status === 'PUBLISHED') return NextResponse.json({ error: 'This mark sheet is published. Ask the office to reopen it before changing marks.', locked: true }, { status: 409 })
    if (exam.status === 'SUBMITTED' && !scope.all) return NextResponse.json({ error: 'This mark sheet has been submitted for review and is locked.', locked: true }, { status: 409 })
    const { scale } = await loadReportConfig(schoolId)
    // Marks may only be attached to pupils of this school (tenant isolation) — the sheet is the exam's class.
    const roll = new Set((await prisma.student.findMany({ where: { schoolId, id: { in: results.map((r: any) => String(r.studentId)) } }, select: { id: true } })).map((s) => s.id))
    const foreign = results.filter((r: any) => !roll.has(String(r.studentId)))
    if (foreign.length) return NextResponse.json({ error: `${foreign.length} pupil(s) in this sheet do not belong to this school` }, { status: 400 })

    for (const r of results) {
      if (r.marks == null || r.marks === '') continue
      const marks = parseFloat(r.marks)
      if (isNaN(marks)) continue
      const grade = computeGrade(marks, exam.totalMarks, scale)
      await prisma.examResult.upsert({
        where: { studentId_examId: { studentId: r.studentId, examId } },
        update: { marks, grade, subjectId: exam.subjectId },
        create: { studentId: r.studentId, examId, subjectId: exam.subjectId, marks, grade },
      })
    }
    await record(guard.session, {
      action: 'update',
      entity: 'ExamResult',
      entityId: examId,
      summary: `Entered marks for ${results.length} student(s) on exam ${exam.name}`,
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}

// GET: fetch results for an exam
export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.exams)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const { searchParams } = new URL(req.url)
  const examId = searchParams.get('examId')
  if (!examId) return NextResponse.json({ error: 'examId required' }, { status: 400 })
  try {
    const exam = await prisma.exam.findFirst({
      where: { id: examId, class: { schoolId } },
      include: {
        class: { include: { students: { where: { status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true, admissionNo: true }, orderBy: { firstName: 'asc' } } } },
        results: true,
      },
    })
    if (!exam) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!canTeach(await teachingScope(guard.session), exam.classId, exam.subjectId)) return NextResponse.json({ error: 'You do not teach this subject in this class' }, { status: 403 })
    const students = (exam.class?.students ?? []).map((s: any) => {
      const result = exam.results.find((r: any) => r.studentId === s.id)
      return { id: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo, marks: result?.marks ?? '', grade: result?.grade ?? '' }
    })
    return NextResponse.json({ students, totalMarks: exam.totalMarks, status: exam.status, reviewNote: exam.reviewNote, missing: students.filter((s: any) => s.marks === '').length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
