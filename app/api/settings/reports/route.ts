export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { record } from '@/lib/audit'
import { DEFAULT_REPORT_CONFIG, ReportConfigSchema, loadReportConfig, saveReportConfig } from '@/lib/reports/settings'

/** GET: the school's report configuration (defaults when never saved). */
export async function GET() {
  const guard = await requireApiRole(ROLES.settingsRead)
  if (!guard.ok) return guard.response
  const config = await loadReportConfig(guard.schoolId)
  return NextResponse.json({ config, defaults: DEFAULT_REPORT_CONFIG })
}

/** PUT: replace the configuration. Body is the full config; `{ reset: true }` restores defaults. */
export async function PUT(req: Request) {
  const guard = await requireApiRole(ROLES.settingsWrite, req)
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const input = body?.reset ? DEFAULT_REPORT_CONFIG : body?.config ?? body
  const parsed = ReportConfigSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `${issue.path.join('.') || 'config'}: ${issue.message}` }, { status: 400 })
  }
  // Grades must be distinct so the distribution tables have one column per band.
  const grades = parsed.data.scale.map((b) => b.grade.toUpperCase())
  if (new Set(grades).size !== grades.length) {
    return NextResponse.json({ error: 'Each grade letter may appear only once' }, { status: 400 })
  }
  const divisions = parsed.data.division.bands.map((b) => b.name.toUpperCase())
  if (new Set(divisions).size !== divisions.length || divisions.includes('0')) {
    return NextResponse.json({ error: 'Division names must be distinct, and "0" is reserved for below the last band' }, { status: 400 })
  }
  const config = await saveReportConfig(guard.schoolId, parsed.data)
  await record(guard.session, {
    action: 'update', entity: 'ReportSettings', entityId: guard.schoolId,
    summary: body?.reset ? 'Reset academic report settings to defaults' : 'Updated academic report settings',
  })
  return NextResponse.json({ config })
}
