export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'

/**
 * Books. The category is chosen from the school's shelf list (BookCategory),
 * never typed free-hand, so "Science", "science" and "Sci." cannot drift apart.
 */
const Body = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  author: z.string().trim().max(120).optional().or(z.literal('')),
  isbn: z.string().trim().max(32).optional().or(z.literal('')),
  categoryId: z.string().min(1, 'Choose a category'),
  totalCopies: z.coerce.number().int().min(1, 'At least one copy').max(10000).default(1),
})

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.library, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message, field: parsed.error.issues[0].path[0] ?? null }, { status: 400 })
  const d = parsed.data
  const category = await prisma.bookCategory.findFirst({ where: { id: d.categoryId, schoolId }, select: { id: true, name: true } })
  if (!category) return NextResponse.json({ error: 'Choose a category from the list', field: 'categoryId' }, { status: 400 })
  const book = await prisma.book.create({
    data: { title: d.title, author: d.author || null, isbn: d.isbn || null, categoryId: category.id, category: category.name, totalCopies: d.totalCopies, available: d.totalCopies, schoolId },
  })
  await record(guard.session, { action: 'create', entity: 'Book', entityId: book.id, summary: `Added "${book.title}" (${category.name}, ${d.totalCopies} copies)` })
  return NextResponse.json(book)
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.library, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = Body.partial().extend({ id: z.string().min(1) }).safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { id, ...d } = parsed.data
  const existing = await prisma.book.findFirst({ where: { id, schoolId }, include: { _count: { select: { issues: { where: { returnDate: null } } } } } })
  if (!existing) return NextResponse.json({ error: 'Book not found' }, { status: 404 })
  let category: { id: string; name: string } | null = null
  if (d.categoryId) {
    category = await prisma.bookCategory.findFirst({ where: { id: d.categoryId, schoolId }, select: { id: true, name: true } })
    if (!category) return NextResponse.json({ error: 'Choose a category from the list' }, { status: 400 })
  }
  const out = existing._count.issues
  if (d.totalCopies !== undefined && d.totalCopies < out) return NextResponse.json({ error: `${out} cop${out === 1 ? 'y is' : 'ies are'} out on loan; total cannot be lower than that` }, { status: 400 })
  const book = await prisma.book.update({
    where: { id },
    data: {
      title: d.title ?? undefined, author: d.author === undefined ? undefined : d.author || null, isbn: d.isbn === undefined ? undefined : d.isbn || null,
      ...(category ? { categoryId: category.id, category: category.name } : {}),
      ...(d.totalCopies !== undefined ? { totalCopies: d.totalCopies, available: d.totalCopies - out } : {}),
    },
  })
  await record(guard.session, { action: 'update', entity: 'Book', entityId: id, summary: `Edited "${book.title}"` })
  return NextResponse.json(book)
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.library, req)
  if (!guard.ok) return guard.response
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const existing = await prisma.book.findFirst({ where: { id, schoolId: guard.schoolId }, include: { _count: { select: { issues: { where: { returnDate: null } } } } } })
  if (!existing) return NextResponse.json({ error: 'Book not found' }, { status: 404 })
  if (existing._count.issues > 0) return NextResponse.json({ error: 'Copies of this book are still out on loan' }, { status: 409 })
  await prisma.bookIssue.deleteMany({ where: { bookId: id } })
  await prisma.book.delete({ where: { id } })
  await record(guard.session, { action: 'delete', entity: 'Book', entityId: id, summary: `Removed "${existing.title}" from the catalogue` })
  return NextResponse.json({ success: true })
}
