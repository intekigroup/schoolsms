export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { rateLimit } from '@/lib/rate-limit'
import { record } from '@/lib/audit'
import { attachment } from '@/lib/pdf'
import { computeClassResults } from '@/lib/reports/academic'
import { teachingScope, canSeeClass } from '@/lib/teaching'
import { renderClassSheet, renderPerformanceSummary, renderReportCards, renderSubjectAnalysis } from '@/lib/reports/pdf'

/**
 * Academic results for one class in one term.
 *
 *   GET ?classId&termId                       → JSON `ClassResults`
 *   GET ?classId&termId&type=report-cards     → every pupil's report card, one PDF
 *   GET ?classId&termId&type=class-sheet      → landscape results sheet
 *   GET ?classId&termId&type=subject-analysis
 *   GET ?classId&termId&type=performance-summary
 *
 * A report type the school has switched off in Settings → Reports is refused,
 * so the settings page is the single place that decides what gets printed.
 */
const TYPES = {
  'report-cards': { flag: 'reportCard', render: (r: any) => renderReportCards(r), file: 'report-cards' },
  'class-sheet': { flag: 'classSheet', render: renderClassSheet, file: 'results-sheet' },
  'subject-analysis': { flag: 'subjectAnalysis', render: renderSubjectAnalysis, file: 'subject-analysis' },
  'performance-summary': { flag: 'performanceSummary', render: renderPerformanceSummary, file: 'performance-summary' },
} as const

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.academicsRead)
  if (!guard.ok) return guard.response
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('classId')
  const termId = searchParams.get('termId')
  const type = searchParams.get('type')
  if (!classId || !termId) return NextResponse.json({ error: 'classId and termId are required' }, { status: 400 })
  if (!canSeeClass(await teachingScope(guard.session), classId)) return NextResponse.json({ error: 'This class is not on your teaching load' }, { status: 403 })

  if (type) {
    const limited = rateLimit(req, 'report', guard.session.user.id)
    if (limited) return limited
  }

  // Printed documents use published marks only; the on-screen JSON may include drafts (flagged as `unpublished`).
  const results = await computeClassResults(guard.schoolId, classId, termId, { publishedOnly: !!type || searchParams.get('published') === '1' })
  if (!results) return NextResponse.json({ error: 'Class or term not found' }, { status: 404 })
  if (!type) return NextResponse.json(results)

  const spec = TYPES[type as keyof typeof TYPES]
  if (!spec) return NextResponse.json({ error: `Unknown report type. Use one of: ${Object.keys(TYPES).join(', ')}` }, { status: 400 })
  if (!results.config.reports[spec.flag]) {
    return NextResponse.json({ error: 'This report is switched off in Settings → Reports' }, { status: 403 })
  }
  const bytes = await spec.render(results)
  await record(guard.session, {
    action: 'create', entity: 'AcademicReport', entityId: classId,
    summary: `Generated ${type} for ${results.class.name}, ${results.term.name} ${results.term.academicYear}`,
  })
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': attachment(`${spec.file}-${results.class.name}-${results.term.name}.pdf`),
      'Cache-Control': 'no-store',
    },
  })
}
