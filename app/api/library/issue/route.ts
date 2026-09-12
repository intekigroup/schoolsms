export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'

// Issue a book to a student
export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.library, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  try {
    const body = await req.json()
    if (!body.bookId || !body.studentId) {
      return NextResponse.json({ error: 'Book and student are required' }, { status: 400 })
    }
    // Tenant isolation
    const book = await prisma.book.findFirst({ where: { id: body.bookId, schoolId } })
    if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 })
    if (book.available < 1) return NextResponse.json({ error: 'No copies available' }, { status: 400 })
    const student = await prisma.student.findFirst({ where: { id: body.studentId, schoolId } })
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    const dueDate = body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

    const [issue] = await prisma.$transaction([
      prisma.bookIssue.create({
        data: { bookId: body.bookId, studentId: body.studentId, dueDate },
      }),
      prisma.book.update({ where: { id: body.bookId }, data: { available: { decrement: 1 } } }),
    ])
    return NextResponse.json(issue)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
