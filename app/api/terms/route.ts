export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'

function parseDate(v: unknown): Date | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.academicsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    const name = String(body.name ?? '').trim()
    const startDate = parseDate(body.startDate)
    const endDate = parseDate(body.endDate)
    if (!name) return NextResponse.json({ error: 'Term name is required' }, { status: 400 })
    if (!body.academicYearId) return NextResponse.json({ error: 'Academic year is required' }, { status: 400 })
    if (!startDate || !endDate) return NextResponse.json({ error: 'Valid start and end dates are required' }, { status: 400 })
    if (endDate <= startDate) return NextResponse.json({ error: 'End date must be after the start date' }, { status: 400 })

    // Tenant isolation: the parent year must belong to this school.
    const year = await prisma.academicYear.findFirst({
      where: { id: body.academicYearId, schoolId },
      select: { id: true, startDate: true, endDate: true },
    })
    if (!year) return NextResponse.json({ error: 'Academic year not found' }, { status: 404 })
    if (startDate < year.startDate || endDate > year.endDate) {
      return NextResponse.json({ error: 'Term dates must fall inside the academic year' }, { status: 400 })
    }

    const makeCurrent = Boolean(body.isCurrent)
    const term = await prisma.$transaction(async (tx) => {
      if (makeCurrent) {
        // Current term is exclusive across the whole school, not just this year.
        await tx.term.updateMany({
          where: { isCurrent: true, academicYear: { schoolId } },
          data: { isCurrent: false },
        })
      }
      return tx.term.create({
        data: { name, startDate, endDate, isCurrent: makeCurrent, academicYearId: year.id },
      })
    })
    return NextResponse.json(term)
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
    if (!id) return NextResponse.json({ error: 'Term id is required' }, { status: 400 })
    const existing = await prisma.term.findFirst({
      where: { id, academicYear: { schoolId } },
      include: { academicYear: { select: { startDate: true, endDate: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'Term not found' }, { status: 404 })

    const startDate = body.startDate === undefined ? existing.startDate : parseDate(body.startDate)
    const endDate = body.endDate === undefined ? existing.endDate : parseDate(body.endDate)
    if (!startDate || !endDate) return NextResponse.json({ error: 'Valid start and end dates are required' }, { status: 400 })
    if (endDate <= startDate) return NextResponse.json({ error: 'End date must be after the start date' }, { status: 400 })
    if (startDate < existing.academicYear.startDate || endDate > existing.academicYear.endDate) {
      return NextResponse.json({ error: 'Term dates must fall inside the academic year' }, { status: 400 })
    }

    const makeCurrent = body.isCurrent === undefined ? existing.isCurrent : Boolean(body.isCurrent)
    const term = await prisma.$transaction(async (tx) => {
      if (makeCurrent && !existing.isCurrent) {
        await tx.term.updateMany({
          where: { isCurrent: true, academicYear: { schoolId } },
          data: { isCurrent: false },
        })
      }
      return tx.term.update({
        where: { id },
        data: { name: body.name?.trim() || existing.name, startDate, endDate, isCurrent: makeCurrent },
      })
    })
    return NextResponse.json(term)
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
  if (!id) return NextResponse.json({ error: 'Term id is required' }, { status: 400 })

  const existing = await prisma.term.findFirst({
    where: { id, academicYear: { schoolId } },
    include: { _count: { select: { exams: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Term not found' }, { status: 404 })
  if (existing._count.exams > 0) {
    return NextResponse.json(
      { error: `This term has ${existing._count.exams} exam(s) recorded against it and cannot be deleted.` },
      { status: 409 }
    )
  }

  try {
    await prisma.term.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.code === 'P2003') {
      return NextResponse.json({ error: 'This term has linked records and cannot be deleted.' }, { status: 409 })
    }
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
