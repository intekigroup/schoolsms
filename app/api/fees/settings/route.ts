export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { feeSettingsFor } from '@/lib/fees/billing'

/** Sibling discount policy: GET current, PUT { siblingSecondPct, siblingThirdPct } (0–100). */
export async function GET() {
  const guard = await requireApiRole(ROLES.fees)
  if (!guard.ok) return guard.response
  const s = await feeSettingsFor(guard.schoolId)
  return NextResponse.json({ siblingSecondPct: s.siblingSecondPct, siblingThirdPct: s.siblingThirdPct })
}

export async function PUT(req: Request) {
  const guard = await requireApiRole(ROLES.settingsWrite, req)
  if (!guard.ok) return guard.response
  const parsed = z.object({ siblingSecondPct: z.coerce.number().int().min(0).max(100), siblingThirdPct: z.coerce.number().int().min(0).max(100) }).safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Discounts must be whole percentages between 0 and 100' }, { status: 400 })
  const d = parsed.data
  const row = await prisma.feeSettings.upsert({ where: { schoolId: guard.schoolId }, create: { schoolId: guard.schoolId, ...d }, update: d })
  await record(guard.session, { action: 'update', entity: 'FeeSettings', entityId: row.id, summary: `Sibling discount set to ${d.siblingSecondPct}% (2nd child) / ${d.siblingThirdPct}% (3rd+)` })
  return NextResponse.json({ siblingSecondPct: row.siblingSecondPct, siblingThirdPct: row.siblingThirdPct })
}
