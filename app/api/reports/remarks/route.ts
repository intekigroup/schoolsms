export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { teachingScope } from '@/lib/teaching'

/**
 * Class-teacher / head-teacher remarks and conduct, per pupil per term. They
 * print on the report card; when none is written and auto remarks are on, the
 * card falls back to a remark for the pupil's overall grade.
 */
const Remark = z.object({
  studentId: z.string().min(1),
  classTeacherRemark: z.string().trim().max(300).nullable().optional(),
  headTeacherRemark: z.string().trim().max(300).nullable().optional(),
  conduct: z.string().trim().max(60).nullable().optional(),
})
const Body = z.object({ termId: z.string().min(1), remarks: z.array(Remark).min(1).max(200) })

export async function PUT(req: Request) {
  const guard = await requireApiRole(ROLES.exams, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  const { termId, remarks } = parsed.data

  const term = await prisma.term.findFirst({ where: { id: termId, academicYear: { schoolId } }, select: { id: true } })
  if (!term) return NextResponse.json({ error: 'Term not found' }, { status: 404 })
  const ids = [...new Set(remarks.map((r) => r.studentId))]
  const owned = await prisma.student.findMany({ where: { id: { in: ids }, schoolId }, select: { id: true, classId: true } })
  if (owned.length !== ids.length) return NextResponse.json({ error: 'One or more pupils are not in your school' }, { status: 404 })
  // Class-teacher remarks belong to the class teacher; the head teacher's line to the office.
  const scope = await teachingScope(guard.session)
  if (!scope.all) {
    if (owned.some((s) => !s.classId || !scope.classTeacherOf.includes(s.classId))) return NextResponse.json({ error: 'Only the class teacher writes remarks for this class' }, { status: 403 })
    if (remarks.some((r) => r.headTeacherRemark)) return NextResponse.json({ error: 'The head teacher remark is written by the office' }, { status: 403 })
  }

  const blank = (v: string | null | undefined) => (v && v.length ? v : null)
  await prisma.$transaction(
    remarks.map((r) => {
      const data = {
        classTeacherRemark: blank(r.classTeacherRemark),
        headTeacherRemark: blank(r.headTeacherRemark),
        conduct: blank(r.conduct),
      }
      return prisma.reportRemark.upsert({
        where: { studentId_termId: { studentId: r.studentId, termId } },
        update: data,
        create: { studentId: r.studentId, termId, ...data },
      })
    })
  )
  await record(guard.session, {
    action: 'update', entity: 'ReportRemark', entityId: termId,
    summary: `Saved report remarks for ${remarks.length} pupil(s)`,
  })
  return NextResponse.json({ success: true, saved: remarks.length })
}
