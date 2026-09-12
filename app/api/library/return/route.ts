export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'

const FINE_PER_DAY = 500 // TZS per day overdue

// Return a previously issued book
export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.library, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    if (!body.issueId) return NextResponse.json({ error: 'Issue id required' }, { status: 400 })
    // Tenant isolation via book.schoolId
    const issue = await prisma.bookIssue.findFirst({
      where: { id: body.issueId, book: { schoolId } },
    })
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    if (issue.returnDate) return NextResponse.json({ error: 'Already returned' }, { status: 400 })

    const now = new Date()
    const overdueMs = now.getTime() - new Date(issue.dueDate).getTime()
    const overdueDays = overdueMs > 0 ? Math.ceil(overdueMs / (24 * 60 * 60 * 1000)) : 0
    const fine = overdueDays * FINE_PER_DAY

    const [updated] = await prisma.$transaction([
      prisma.bookIssue.update({ where: { id: issue.id }, data: { returnDate: now, fine } }),
      prisma.book.update({ where: { id: issue.bookId }, data: { available: { increment: 1 } } }),
    ])
    return NextResponse.json({ ...updated, fine, overdueDays })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
