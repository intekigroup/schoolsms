export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { record } from '@/lib/audit'
import { DEFAULT_HR_CONFIG, HrConfigSchema, loadHrConfig, saveHrConfig } from '@/lib/hr/settings'

export async function GET() {
  const guard = await requireApiRole(ROLES.settingsRead)
  if (!guard.ok) return guard.response
  return NextResponse.json({ config: await loadHrConfig(guard.schoolId), defaults: DEFAULT_HR_CONFIG })
}

export async function PUT(req: Request) {
  const guard = await requireApiRole(ROLES.settingsWrite, req)
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const parsed = HrConfigSchema.safeParse(body?.reset ? DEFAULT_HR_CONFIG : body?.config ?? body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `${issue.path.join('.') || 'config'}: ${issue.message}` }, { status: 400 })
  }
  const keys = parsed.data.leaveTypes.map((t) => t.key)
  if (new Set(keys).size !== keys.length) return NextResponse.json({ error: 'Leave type keys must be distinct' }, { status: 400 })
  const config = await saveHrConfig(guard.schoolId, parsed.data)
  await record(guard.session, { action: 'update', entity: 'HrSettings', entityId: guard.schoolId, summary: body?.reset ? 'Reset HR & payroll settings' : 'Updated HR & payroll settings' })
  return NextResponse.json({ config })
}
