export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { checkPlanLimit } from '@/lib/plan-limits'
import { prisma } from '@/lib/db'

export async function GET() {
  const guard = await requireApiRole(ROLES.staff)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const staff = await prisma.staff.findMany({ where: { schoolId }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(staff)
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.staff, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const overLimit = await checkPlanLimit(schoolId, 'staff')
  if (overLimit) return overLimit
  try {
    const body = await req.json()
    const staff = await prisma.staff.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        gender: body.gender ?? 'MALE',
        employeeNo: body.employeeNo ?? `EMP-${Date.now()}`,
        role: body.role ?? 'Teacher',
        phone: body.phone ?? null,
        salary: body.salary ?? 0,
        schoolId,
      },
    })
    return NextResponse.json(staff)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.staff, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'Staff id is required' }, { status: 400 })
    const existing = await prisma.staff.findFirst({ where: { id, schoolId } })
    if (!existing) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    const staff = await prisma.staff.update({
      where: { id },
      data: {
        firstName: body.firstName ?? existing.firstName,
        lastName: body.lastName ?? existing.lastName,
        gender: body.gender ?? existing.gender,
        employeeNo: body.employeeNo ?? existing.employeeNo,
        role: body.role ?? existing.role,
        phone: body.phone === undefined ? existing.phone : (body.phone || null),
        salary: body.salary === undefined ? existing.salary : body.salary,
        status: body.status ?? existing.status,
      },
    })
    return NextResponse.json(staff)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.staff, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Staff id is required' }, { status: 400 })
  const existing = await prisma.staff.findFirst({ where: { id, schoolId } })
  if (!existing) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  try {
    await prisma.staff.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.code === 'P2003') {
      return NextResponse.json({ error: 'This staff member has linked records (timetable, attendance, or leave). Change their status to Resigned instead of deleting.' }, { status: 409 })
    }
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
