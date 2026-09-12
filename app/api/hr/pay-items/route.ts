export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'

/** Recurring allowances and deductions on a staff member's pay. */
const Create = z.object({
  staffId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['ALLOWANCE', 'DEDUCTION']),
  amount: z.number().int().min(0).max(1_000_000_000),
  taxable: z.boolean().optional(),
})
const Update = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(60).optional(), amount: z.number().int().min(0).max(1_000_000_000).optional(), taxable: z.boolean().optional(), active: z.boolean().optional() })

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.hr, req)
  if (!guard.ok) return guard.response
  const parsed = Create.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const staff = await prisma.staff.findFirst({ where: { id: parsed.data.staffId, schoolId: guard.schoolId }, select: { id: true, firstName: true, lastName: true } })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  const item = await prisma.staffPayItem.create({ data: { ...parsed.data, taxable: parsed.data.kind === 'ALLOWANCE' ? parsed.data.taxable ?? true : false } })
  await record(guard.session, { action: 'create', entity: 'StaffPayItem', entityId: item.id, summary: `Added ${parsed.data.kind.toLowerCase()} "${parsed.data.name}" (TZS ${parsed.data.amount.toLocaleString('en-GB')}) for ${staff.firstName} ${staff.lastName}` })
  return NextResponse.json({ item })
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.hr, req)
  if (!guard.ok) return guard.response
  const parsed = Update.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { id, ...data } = parsed.data
  const res = await prisma.staffPayItem.updateMany({ where: { id, staff: { schoolId: guard.schoolId } }, data })
  if (res.count === 0) return NextResponse.json({ error: 'Pay item not found' }, { status: 404 })
  await record(guard.session, { action: 'update', entity: 'StaffPayItem', entityId: id, summary: 'Updated a pay item' })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.hr, req)
  if (!guard.ok) return guard.response
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const res = await prisma.staffPayItem.deleteMany({ where: { id, staff: { schoolId: guard.schoolId } } })
  if (res.count === 0) return NextResponse.json({ error: 'Pay item not found' }, { status: 404 })
  await record(guard.session, { action: 'delete', entity: 'StaffPayItem', entityId: id, summary: 'Removed a pay item' })
  return NextResponse.json({ success: true })
}
