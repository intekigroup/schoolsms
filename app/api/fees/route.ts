export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'

// Create a fee structure
export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.fees, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    if (!body.name || !body.amount) {
      return NextResponse.json({ error: 'Name and amount are required' }, { status: 400 })
    }
    const classId = body.classId && body.classId !== 'ALL' ? String(body.classId) : null
    if (classId && !(await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } }))) {
      return NextResponse.json({ error: 'Class not found' }, { status: 400 })
    }
    const structure = await prisma.feeStructure.create({
      data: {
        name: body.name,
        amount: Number(body.amount),
        description: body.description ?? null,
        classId,
        // Optional due date drives the debtors ageing report.
        dueDate: body.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? new Date(`${body.dueDate}T00:00:00Z`) : null,
        schoolId,
      },
    })
    return NextResponse.json(structure)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}

/** PATCH { id, name?, amount?, dueDate?, discountable? } — edit a fee structure. */
export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.fees, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const body = await req.json().catch(() => ({}))
  const existing = await prisma.feeStructure.findFirst({ where: { id: String(body.id ?? ''), schoolId } })
  if (!existing) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 })
  const amount = body.amount === undefined ? undefined : Number(body.amount)
  if (amount !== undefined && !(amount > 0)) return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })
  const updated = await prisma.feeStructure.update({
    where: { id: existing.id },
    data: {
      name: body.name ? String(body.name).trim() : undefined, amount, description: body.description === undefined ? undefined : body.description || null,
      dueDate: body.dueDate === undefined ? undefined : body.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? new Date(`${body.dueDate}T00:00:00Z`) : null,
      discountable: typeof body.discountable === 'boolean' ? body.discountable : undefined,
    },
  })
  await record(guard.session, { action: 'update', entity: 'FeeStructure', entityId: updated.id, summary: `Edited fee structure ${updated.name}${typeof body.discountable === 'boolean' ? ` (sibling discount ${body.discountable ? 'on' : 'off'})` : ''}` })
  return NextResponse.json(updated)
}
