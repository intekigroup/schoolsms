export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { normaliseTzPhone } from '@/lib/sms/types'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'

/**
 * Guardian records.
 *
 * Guardians existed only because the seed created them — a real school could not
 * enrol a pupil's parent at all, which made onboarding impossible.
 *
 * Guardians carry no `schoolId`; they belong to a school through their children,
 * so every query is scoped with `inSchool` rather than a direct tenant column.
 * A guardian is always created attached to at least one pupil, otherwise the
 * record would be unreachable from any school.
 */

const inSchool = (schoolId: string) => ({ students: { some: { student: { schoolId } } } })

const CreateSchema = z.object({
  firstName: z.string({ required_error: 'First name is required' }).trim().min(1, 'First name is required').max(80),
  lastName: z.string({ required_error: 'Last name is required' }).trim().min(1, 'Last name is required').max(80),
  phone: z.string({ required_error: 'A contact phone number is required' }).trim().min(6, 'A contact phone number is required').max(40),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255).optional().or(z.literal('')),
  relationship: z.string().trim().max(40).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  occupation: z.string().trim().max(80).optional().or(z.literal('')),
  studentId: z.string({ required_error: 'Choose the pupil this guardian belongs to' }).min(1, 'Choose the pupil this guardian belongs to'),
  isPrimary: z.boolean().optional(),
})

const UpdateSchema = CreateSchema.partial().extend({ id: z.string().min(1) })

const blank = (v: string | undefined) => (v && v.length ? v : null)

export async function GET() {
  const guard = await requireApiRole(ROLES.studentsRead)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const guardians = await prisma.guardian.findMany({
    where: inSchool(schoolId),
    include: { students: { include: { student: { select: { id: true, firstName: true, lastName: true } } } } },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
  return NextResponse.json(guardians)
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid details' }, { status: 400 })
  }
  const body = parsed.data

  try {
    const student = await prisma.student.findFirst({
      where: { id: body.studentId, schoolId },
      select: { id: true, firstName: true, lastName: true },
    })
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    // One person, one guardian record: a parent who already exists (same phone, e.g. a child
    // in another Shule SMS school) is linked to this pupil rather than duplicated, so their
    // single login shows every child.
    const phoneDigits = normaliseTzPhone(body.phone)
    const existing = phoneDigits ? await prisma.guardian.findFirst({ where: { OR: [{ phone: body.phone }, { phone: `+${phoneDigits}` }, { phone: phoneDigits }, { phone: `0${phoneDigits.slice(3)}` }] }, select: { id: true, firstName: true, lastName: true, userId: true } }) : null
    if (existing) {
      const already = await prisma.studentGuardian.findFirst({ where: { studentId: student.id, guardianId: existing.id } })
      if (!already) await prisma.studentGuardian.create({ data: { studentId: student.id, guardianId: existing.id, isPrimary: body.isPrimary ?? false } })
      const guardian = await prisma.guardian.findUnique({ where: { id: existing.id } })
      await record(guard.session, { action: 'update', entity: 'Guardian', entityId: existing.id, summary: `Linked existing guardian ${existing.firstName} ${existing.lastName} (same phone) to ${student.firstName} ${student.lastName}` })
      return NextResponse.json({ ...guardian, reused: true, hasLogin: !!existing.userId })
    }

    const guardian = await prisma.guardian.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        phone: phoneDigits ? `+${phoneDigits}` : body.phone,
        email: blank(body.email),
        relationship: blank(body.relationship),
        address: blank(body.address),
        occupation: blank(body.occupation),
        students: { create: { studentId: student.id, isPrimary: body.isPrimary ?? false } },
      },
    })

    await record(guard.session, {
      action: 'create',
      entity: 'Guardian',
      entityId: guardian.id,
      summary: `Added guardian ${guardian.firstName} ${guardian.lastName} for ${student.firstName} ${student.lastName}`,
    })

    return NextResponse.json(guardian)
  } catch (e: any) {
    console.error('guardian create failed:', e)
    return NextResponse.json({ error: 'Could not add the guardian' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid details' }, { status: 400 })
  }
  const body = parsed.data

  try {
    const existing = await prisma.guardian.findFirst({ where: { id: body.id, ...inSchool(schoolId) } })
    if (!existing) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 })

    const guardian = await prisma.guardian.update({
      where: { id: existing.id },
      data: {
        firstName: body.firstName ?? existing.firstName,
        lastName: body.lastName ?? existing.lastName,
        phone: body.phone ?? existing.phone,
        email: body.email === undefined ? existing.email : blank(body.email),
        relationship: body.relationship === undefined ? existing.relationship : blank(body.relationship),
        address: body.address === undefined ? existing.address : blank(body.address),
        occupation: body.occupation === undefined ? existing.occupation : blank(body.occupation),
      },
    })

    await record(guard.session, {
      action: 'update',
      entity: 'Guardian',
      entityId: guardian.id,
      summary: `Updated guardian ${guardian.firstName} ${guardian.lastName}`,
    })

    return NextResponse.json(guardian)
  } catch (e: any) {
    console.error('guardian update failed:', e)
    return NextResponse.json({ error: 'Could not update the guardian' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Guardian id is required' }, { status: 400 })

  try {
    const existing = await prisma.guardian.findFirst({
      where: { id, ...inSchool(schoolId) },
      select: { id: true, firstName: true, lastName: true, userId: true },
    })
    if (!existing) return NextResponse.json({ error: 'Guardian not found' }, { status: 404 })

    // A portal login outlives the guardian record it points at, so make the
    // office remove it deliberately rather than orphaning an account.
    if (existing.userId) {
      return NextResponse.json(
        { error: 'This guardian has a portal login. Remove the login first, then delete the record.' },
        { status: 409 }
      )
    }

    // StudentGuardian rows cascade with the guardian by schema.
    await prisma.guardian.delete({ where: { id: existing.id } })

    await record(guard.session, {
      action: 'delete',
      entity: 'Guardian',
      entityId: existing.id,
      summary: `Deleted guardian ${existing.firstName} ${existing.lastName}`,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('guardian delete failed:', e)
    return NextResponse.json({ error: 'Could not delete the guardian' }, { status: 500 })
  }
}
