export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'

export async function GET() {
  const guard = await requireApiRole(ROLES.academicsRead)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const subjects = await prisma.subject.findMany({
    where: { schoolId },
    include: { _count: { select: { classes: true, exams: true, timetableSlots: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(subjects)
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.academicsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    const name = String(body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Subject name is required' }, { status: 400 })

    const code = body.code ? String(body.code).trim().toUpperCase() : null
    if (code) {
      const clash = await prisma.subject.findFirst({ where: { schoolId, code } })
      if (clash) return NextResponse.json({ error: `Code "${code}" is already used by ${clash.name}` }, { status: 409 })
    }

    const subject = await prisma.subject.create({
      data: { name, code, description: body.description?.trim() || null, schoolId },
    })
    return NextResponse.json(subject)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.academicsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'Subject id is required' }, { status: 400 })
    const existing = await prisma.subject.findFirst({ where: { id, schoolId } })
    if (!existing) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })

    const code = body.code === undefined ? existing.code : (String(body.code).trim().toUpperCase() || null)
    if (code && code !== existing.code) {
      const clash = await prisma.subject.findFirst({ where: { schoolId, code, id: { not: id } } })
      if (clash) return NextResponse.json({ error: `Code "${code}" is already used by ${clash.name}` }, { status: 409 })
    }

    const subject = await prisma.subject.update({
      where: { id },
      data: {
        name: body.name?.trim() || existing.name,
        code,
        description: body.description === undefined ? existing.description : (body.description?.trim() || null),
      },
    })
    return NextResponse.json(subject)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.academicsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Subject id is required' }, { status: 400 })

  const existing = await prisma.subject.findFirst({
    where: { id, schoolId },
    include: { _count: { select: { exams: true, timetableSlots: true, examResults: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })

  // ClassSubject/StaffSubject cascade, but exam history must not disappear silently.
  const { exams, timetableSlots, examResults } = existing._count
  if (exams || timetableSlots || examResults) {
    const parts = [
      exams && `${exams} exam(s)`,
      timetableSlots && `${timetableSlots} timetable slot(s)`,
      examResults && `${examResults} result(s)`,
    ].filter(Boolean)
    return NextResponse.json(
      { error: `This subject is still used by ${parts.join(', ')}. Remove those first.` },
      { status: 409 }
    )
  }

  try {
    await prisma.subject.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.code === 'P2003') {
      return NextResponse.json({ error: 'This subject has linked records and cannot be deleted.' }, { status: 409 })
    }
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
