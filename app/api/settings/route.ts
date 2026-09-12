export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { normaliseTzPhone } from '@/lib/sms/types'
import { TZ_REGIONS } from '@/lib/tz'

/**
 * School profile — everything that prints on a letterhead, receipt, report
 * card or ID card, plus the registration details captured at signup. The
 * logo is set through /api/photos (kind=logo), never through this body.
 */
const SELECT = {
  id: true, name: true, shortName: true, motto: true, schoolType: true, schoolLevel: true, registrationNo: true,
  email: true, phone: true, website: true,
  address: true, poBox: true, city: true, district: true, region: true,
  approxPupils: true, preferredLocale: true, logoUrl: true, createdAt: true,
} as const

const Body = z.object({
  name: z.string().trim().min(2, 'School name must be at least 2 characters').max(150),
  shortName: z.string().trim().max(20).nullish(),
  motto: z.string().trim().max(160).nullish(),
  schoolType: z.enum(['PRIVATE', 'FAITH', 'COMMUNITY', 'INTERNATIONAL', 'OTHER']).nullish(),
  schoolLevel: z.array(z.enum(['NURSERY', 'PRIMARY', 'O_LEVEL', 'A_LEVEL'])).min(1, 'Choose at least one level').optional(),
  registrationNo: z.string().trim().max(40).nullish(),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255).or(z.literal('')).nullish(),
  phone: z.string().trim().max(20).nullish(),
  website: z.string().trim().max(120).nullish(),
  address: z.string().trim().max(200).nullish(),
  poBox: z.string().trim().max(40).nullish(),
  city: z.string().trim().max(60).nullish(),
  district: z.string().trim().max(60).nullish(),
  region: z.string().trim().max(40).nullish(),
  approxPupils: z.number().int().min(0).max(100000).nullish(),
  preferredLocale: z.enum(['en', 'sw']).optional(),
})

export async function GET() {
  const guard = await requireApiRole(ROLES.settingsRead)
  if (!guard.ok) return guard.response
  const school = await prisma.school.findUnique({ where: { id: guard.schoolId }, select: SELECT })
  return NextResponse.json(school ?? {})
}

export async function PUT(req: Request) {
  const guard = await requireApiRole(ROLES.settingsWrite, req)
  if (!guard.ok) return guard.response
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: issue?.message ?? 'Invalid details', field: issue?.path?.[0] ?? null }, { status: 400 })
  }
  const d = parsed.data
  if (d.region && !(TZ_REGIONS as readonly string[]).includes(d.region)) return NextResponse.json({ error: 'Choose a region from the list', field: 'region' }, { status: 400 })
  let phone: string | null | undefined = d.phone
  if (d.phone) {
    const n = normaliseTzPhone(d.phone)
    if (!n) return NextResponse.json({ error: 'Enter a valid Tanzanian phone number (e.g. 0745 389 941)', field: 'phone' }, { status: 400 })
    phone = `+${n}`
  }
  const website = d.website ? (/^https?:\/\//i.test(d.website) ? d.website : `https://${d.website}`) : d.website
  const blank = (v: string | null | undefined) => (v === undefined ? undefined : v || null)
  const updated = await prisma.school.update({
    where: { id: guard.schoolId },
    data: {
      name: d.name, shortName: blank(d.shortName), motto: blank(d.motto), schoolType: blank(d.schoolType), schoolLevel: d.schoolLevel,
      registrationNo: blank(d.registrationNo), email: blank(d.email), phone: blank(phone), website: blank(website),
      address: blank(d.address), poBox: blank(d.poBox?.replace(/^p\.?o\.?\s*box\s*/i, '')), city: blank(d.city ?? d.district), district: blank(d.district), region: blank(d.region),
      approxPupils: d.approxPupils === undefined ? undefined : d.approxPupils, preferredLocale: d.preferredLocale,
    },
    select: SELECT,
  })
  await record(guard.session, { action: 'update', entity: 'School', entityId: guard.schoolId, summary: 'Updated the school profile' })
  return NextResponse.json(updated)
}
