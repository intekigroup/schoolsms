export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { formatDate } from '@/lib/format'

/** Pupils in a class, shaped for the ID card picker and preview. */
export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.idCards)
  if (!guard.ok) return guard.response
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'classId is required' }, { status: 400 })
  const students = await prisma.student.findMany({
    where: { schoolId: guard.schoolId, classId, status: 'ACTIVE' },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true, firstName: true, lastName: true, admissionNo: true, gender: true, dateOfBirth: true, photoUrl: true,
      class: { select: { name: true } },
      guardians: { orderBy: { isPrimary: 'desc' }, take: 1, select: { guardian: { select: { firstName: true, lastName: true, phone: true } } } },
    },
  })
  return NextResponse.json({
    students: students.map((s) => {
      const g = s.guardians[0]?.guardian
      return {
        id: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo, className: s.class?.name ?? null,
        gender: s.gender === 'MALE' ? 'Male' : s.gender === 'FEMALE' ? 'Female' : String(s.gender),
        dateOfBirth: formatDate(s.dateOfBirth), photoUrl: s.photoUrl,
        guardian: g ? `${g.firstName} ${g.lastName} · ${g.phone}` : null,
      }
    }),
  })
}
