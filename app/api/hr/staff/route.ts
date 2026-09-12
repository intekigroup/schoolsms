export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'

/** Employment details on a staff record — the HR fields the Teachers page does not show. */
const Body = z.object({
  id: z.string().min(1),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'PART_TIME', 'VOLUNTEER', 'INTERN']).optional(),
  department: z.string().trim().max(60).nullable().optional(),
  hireDate: z.string().date().nullable().optional(),
  contractEnd: z.string().date().nullable().optional(),
  tin: z.string().trim().max(20).nullable().optional(),
  nssfNo: z.string().trim().max(30).nullable().optional(),
  bankName: z.string().trim().max(60).nullable().optional(),
  bankAccount: z.string().trim().max(40).nullable().optional(),
  salary: z.number().min(0).max(1_000_000_000).optional(),
  qualification: z.string().trim().max(120).nullable().optional(),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED']).optional(),
})

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.hr)
  if (!guard.ok) return guard.response
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const where = { schoolId: guard.schoolId, ...(id ? { id } : {}) }
  const staff = await prisma.staff.findMany({
    where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true, employeeNo: true, firstName: true, lastName: true, gender: true, role: true, phone: true, qualification: true, status: true, salary: true,
      employmentType: true, department: true, hireDate: true, contractEnd: true, tin: true, nssfNo: true, bankName: true, bankAccount: true, userId: true,
      payItems: { where: { active: true }, orderBy: { createdAt: 'asc' } },
    },
  })
  return NextResponse.json({ staff })
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.hr, req)
  if (!guard.ok) return guard.response
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` }, { status: 400 })
  const { id, hireDate, contractEnd, ...rest } = parsed.data
  const existing = await prisma.staff.findFirst({ where: { id, schoolId: guard.schoolId }, select: { id: true, firstName: true, lastName: true } })
  if (!existing) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  const blank = (v: string | null | undefined) => (v === undefined ? undefined : v && v.length ? v : null)
  const staff = await prisma.staff.update({
    where: { id },
    data: {
      ...rest,
      department: blank(rest.department), tin: blank(rest.tin), nssfNo: blank(rest.nssfNo), bankName: blank(rest.bankName), bankAccount: blank(rest.bankAccount), qualification: blank(rest.qualification),
      hireDate: hireDate === undefined ? undefined : hireDate ? new Date(hireDate) : null,
      contractEnd: contractEnd === undefined ? undefined : contractEnd ? new Date(contractEnd) : null,
    },
  })
  await record(guard.session, { action: 'update', entity: 'Staff', entityId: id, summary: `Updated employment details for ${existing.firstName} ${existing.lastName}` })
  return NextResponse.json({ staff })
}
