export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { checkPlanLimit } from '@/lib/plan-limits'
import { prisma } from '@/lib/db'
import { teachingScope, studentFilter } from '@/lib/teaching'

export async function GET() {
  const guard = await requireApiRole(ROLES.studentsRead)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const scope = await teachingScope(guard.session)
  const students = await prisma.student.findMany({
    where: { schoolId, ...studentFilter(scope) },
    include: { class: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(students)
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const overLimit = await checkPlanLimit(schoolId, 'students')
  if (overLimit) return overLimit

  try {
    const body = await req.json()
    const { firstName, lastName, gender, dateOfBirth, classId, admissionNo } = body
    if (!firstName || !lastName || !admissionNo) {
      return NextResponse.json({ error: 'First name, last name, and admission number are required' }, { status: 400 })
    }
    if (classId && !(await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } }))) {
      return NextResponse.json({ error: 'Class not found' }, { status: 400 })
    }
    const student = await prisma.student.create({
      data: {
        firstName,
        lastName,
        gender: gender ?? 'MALE',
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : new Date(),
        classId: classId || null,
        admissionNo,
        schoolId,
      },
    })
    return NextResponse.json(student)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  try {
    const body = await req.json()
    const { id, firstName, lastName, gender, dateOfBirth, classId, admissionNo, status } = body
    if (!id) return NextResponse.json({ error: 'Student id is required' }, { status: 400 })
    const existing = await prisma.student.findFirst({ where: { id, schoolId } })
    if (!existing) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (classId && classId !== existing.classId && !(await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } }))) {
      return NextResponse.json({ error: 'Class not found' }, { status: 400 })
    }
    const student = await prisma.student.update({
      where: { id },
      data: {
        firstName: firstName ?? existing.firstName,
        lastName: lastName ?? existing.lastName,
        gender: gender ?? existing.gender,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : existing.dateOfBirth,
        classId: classId === undefined ? existing.classId : (classId || null),
        admissionNo: admissionNo ?? existing.admissionNo,
        status: status ?? existing.status,
      },
    })
    return NextResponse.json(student)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.studentsDelete, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Student id is required' }, { status: 400 })
  const existing = await prisma.student.findFirst({
    where: { id, schoolId },
    include: {
      _count: {
        select: { attendances: true, examResults: true, feePayments: true, bookIssues: true },
      },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  // Attendance, results, payments and loans are Restrict-guarded in the schema,
  // so the delete below would fail anyway — but naming what is in the way is far
  // more useful than a generic constraint error.
  const { attendances, examResults, feePayments, bookIssues } = existing._count
  const blocking = [
    attendances && `${attendances} attendance record(s)`,
    examResults && `${examResults} exam result(s)`,
    feePayments && `${feePayments} fee payment(s)`,
    bookIssues && `${bookIssues} library loan(s)`,
  ].filter(Boolean)

  if (blocking.length) {
    return NextResponse.json(
      {
        error: `${existing.firstName} ${existing.lastName} has ${blocking.join(', ')}. Deleting would destroy that history — set their status to Graduated or Transferred instead.`,
        hasHistory: true,
      },
      { status: 409 }
    )
  }

  try {
    await prisma.student.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.code === 'P2003') {
      return NextResponse.json(
        { error: 'This student has linked records. Change their status to Graduated/Transferred instead of deleting.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 })
  }
}
