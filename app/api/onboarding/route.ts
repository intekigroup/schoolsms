export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { onboardingFor } from '@/lib/onboarding'

/** GET the checklist; PATCH { dismissed: true|false } to hide or restore it. */
export async function GET() {
  const guard = await requireApiRole(ROLES.settingsRead)
  if (!guard.ok) return guard.response
  return NextResponse.json(await onboardingFor(guard.schoolId))
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.settingsWrite, req)
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => ({}))
  await prisma.school.update({ where: { id: guard.schoolId }, data: { onboarding: { dismissed: body?.dismissed === true } } })
  return NextResponse.json(await onboardingFor(guard.schoolId))
}
