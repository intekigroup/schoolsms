export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'

/**
 * Staff login provisioning — the same shape as pupils' and guardians'.
 *
 *   POST   { staffId, email?, role? }   create a login (role TEACHER/ACCOUNTANT/LIBRARIAN, guessed from the job title)
 *   PUT    { staffId }                  reset the password (returns a new temporary one)
 *   DELETE ?staffId                     unlink and disable the login
 *
 * The temporary password is returned once, for the office to hand over.
 */
const PortalRole = z.enum(['TEACHER', 'ACCOUNTANT', 'LIBRARIAN'])
const Create = z.object({ staffId: z.string().min(1), email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255).optional(), role: PortalRole.optional() })

function tempPassword() {
  return randomBytes(6).toString('base64url').replace(/[-_]/g, '') + randomBytes(2).toString('hex')
}

/** "Accountant"/"Bursar" → ACCOUNTANT, "Librarian" → LIBRARIAN, everything else teaches. */
function portalRoleFor(title: string): z.infer<typeof PortalRole> {
  const t = title.toLowerCase()
  if (/account|bursar|finance|cashier/.test(t)) return 'ACCOUNTANT'
  if (/librar/.test(t)) return 'LIBRARIAN'
  return 'TEACHER'
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.staff, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = Create.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const staff = await prisma.staff.findFirst({ where: { id: parsed.data.staffId, schoolId }, select: { id: true, firstName: true, lastName: true, employeeNo: true, role: true, userId: true, status: true } })
  if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  if (staff.userId) return NextResponse.json({ error: 'This staff member already has a login.' }, { status: 409 })
  if (staff.status === 'RESIGNED' || staff.status === 'TERMINATED') return NextResponse.json({ error: 'Cannot create a login for staff who have left.' }, { status: 400 })

  const email = parsed.data.email ?? `${staff.employeeNo.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}@staff.local`
  const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (taken) return NextResponse.json({ error: `${email} is already in use. Give this staff member a different address.` }, { status: 409 })

  const role = parsed.data.role ?? portalRoleFor(staff.role)
  const password = tempPassword()
  const user = await prisma.user.create({
    data: { email, name: `${staff.firstName} ${staff.lastName}`, role, schoolId, emailVerified: new Date(), hashedPassword: await bcrypt.hash(password, 12), staffProfile: { connect: { id: staff.id } } },
    select: { id: true, email: true, role: true },
  })
  await record(guard.session, { action: 'create', entity: 'StaffLogin', entityId: staff.id, summary: `Created ${role === 'ACCOUNTANT' ? 'an' : 'a'} ${role.toLowerCase()} login (${email}) for ${staff.firstName} ${staff.lastName} (${staff.employeeNo})` })
  return NextResponse.json({ ok: true, email: user.email, role: user.role, password })
}

export async function PUT(req: Request) {
  const guard = await requireApiRole(ROLES.staff, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = z.object({ staffId: z.string().min(1) }).safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
  const staff = await prisma.staff.findFirst({ where: { id: parsed.data.staffId, schoolId }, select: { id: true, firstName: true, lastName: true, userId: true, user: { select: { email: true } } } })
  if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  if (!staff.userId) return NextResponse.json({ error: 'This staff member has no login.' }, { status: 409 })
  const password = tempPassword()
  // A reset also ends every session the old password opened, and clears a lockout.
  await prisma.user.update({ where: { id: staff.userId }, data: { hashedPassword: await bcrypt.hash(password, 12), tokenVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null, isActive: true } })
  await record(guard.session, { action: 'update', entity: 'StaffLogin', entityId: staff.id, summary: `Reset the login password for ${staff.firstName} ${staff.lastName}` })
  return NextResponse.json({ ok: true, email: staff.user?.email, password })
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.staff, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const staffId = new URL(req.url).searchParams.get('staffId')
  if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
  const staff = await prisma.staff.findFirst({ where: { id: staffId, schoolId }, select: { id: true, firstName: true, lastName: true, userId: true } })
  if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  if (!staff.userId) return NextResponse.json({ error: 'This staff member has no login.' }, { status: 409 })
  if (staff.userId === guard.session.user.id) return NextResponse.json({ error: 'You cannot remove your own login.' }, { status: 400 })
  await prisma.$transaction([
    prisma.staff.update({ where: { id: staff.id }, data: { userId: null } }),
    prisma.user.update({ where: { id: staff.userId }, data: { isActive: false, tokenVersion: { increment: 1 } } }),
  ])
  await record(guard.session, { action: 'delete', entity: 'StaffLogin', entityId: staff.id, summary: `Removed the login for ${staff.firstName} ${staff.lastName}` })
  return NextResponse.json({ ok: true })
}
