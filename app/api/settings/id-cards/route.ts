export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { record } from '@/lib/audit'
import { DEFAULT_ID_CARD_CONFIG, IdCardConfigSchema, loadIdCardConfig, saveIdCardConfig } from '@/lib/id-cards/settings'

/** GET: the school's ID card design (defaults when never saved). */
export async function GET() {
  const guard = await requireApiRole(ROLES.settingsRead)
  if (!guard.ok) return guard.response
  return NextResponse.json({ config: await loadIdCardConfig(guard.schoolId), defaults: DEFAULT_ID_CARD_CONFIG })
}

/** PUT: replace the design. `{ reset: true }` restores defaults. */
export async function PUT(req: Request) {
  const guard = await requireApiRole(ROLES.settingsWrite, req)
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const parsed = IdCardConfigSchema.safeParse(body?.reset ? DEFAULT_ID_CARD_CONFIG : body?.config ?? body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `${issue.path.join('.') || 'config'}: ${issue.message}` }, { status: 400 })
  }
  const config = await saveIdCardConfig(guard.schoolId, parsed.data)
  await record(guard.session, {
    action: 'update', entity: 'IdCardSettings', entityId: guard.schoolId,
    summary: body?.reset ? 'Reset ID card design to defaults' : 'Updated ID card design',
  })
  return NextResponse.json({ config })
}
