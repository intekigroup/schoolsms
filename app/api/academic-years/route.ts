export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'

/** Parses a yyyy-mm-dd (or ISO) string, returning null when unusable. */
function parseDate(v: unknown): Date | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET() {
  const guard = await requireApiRole(ROLES.academicsRead)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const years = await prisma.academicYear.findMany({
    where: { schoolId },
    include: {
      terms: { orderBy: { startDate: 'asc' } },
      _count: { select: { exams: true } },
    },
    orderBy: { startDate: 'desc' },
  })
  return NextResponse.json(years)
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
    if (!name) return NextResponse.json({ error: 'Year name is required' }, { status: 400 })
    if (!startDate || !endDate) return NextResponse.json({ error: 'Valid start and end dates are required' }, { status: 400 })
    if (endDate <= startDate) return NextResponse.json({ error: 'End date must be after the start date' }, { status: 400 })

    // Only one year can be current per school.
    const makeCurrent = Boolean(body.isCurrent)
    const year = await prisma.$transaction(async (tx) => {
      if (makeCurrent) {
        await tx.academicYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } })
      }
      return tx.academicYear.create({
        data: { name, startDate, endDate, isCurrent: makeCurrent, schoolId },
      })
    })
    return NextResponse.json(year)
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
    if (!id) return NextResponse.json({ error: 'Academic year id is required' }, { status: 400 })
    const existing = await prisma.academicYear.findFirst({ where: { id, schoolId } })
    if (!existing) return NextResponse.json({ error: 'Academic year not found' }, { status: 404 })

    const startDate = body.startDate === undefined ? existing.startDate : parseDate(body.startDate)
    const endDate = body.endDate === undefined ? existing.endDate : parseDate(body.endDate)
    if (!startDate || !endDate) return NextResponse.json({ error: 'Valid start and end dates are required' }, { status: 400 })
    if (endDate <= startDate) return NextResponse.json({ error: 'End date must be after the start date' }, { status: 400 })

    const makeCurrent = body.isCurrent === undefined ? existing.isCurrent : Boolean(body.isCurrent)
    const year = await prisma.$transaction(async (tx) => {
      if (makeCurrent && !existing.isCurrent) {
        await tx.academicYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } })
      }
      return tx.academicYear.update({
        where: { id },
        data: { name: body.name?.trim() || existing.name, startDate, endDate, isCurrent: makeCurrent },
      })
    })
    return NextResponse.json(year)
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
  if (!id) return NextResponse.json({ error: 'Academic year id is required' }, { status: 400 })

  const existing = await prisma.academicYear.findFirst({
    where: { id, schoolId },
    include: { _count: { select: { exams: true, terms: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Academic year not found' }, { status: 404 })
  if (existing._count.exams > 0) {
    return NextResponse.json(
      { error: `This year has ${existing._count.exams} exam(s) recorded against it and cannot be deleted.` },
      { status: 409 }
    )
  }

  try {
    // Terms cascade with the year by schema.
    await prisma.academicYear.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.code === 'P2003') {
      return NextResponse.json({ error: 'This year has linked records and cannot be deleted.' }, { status: 409 })
    }
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
