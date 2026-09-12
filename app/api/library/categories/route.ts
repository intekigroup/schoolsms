export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { bookCategoriesFor } from '@/lib/library'

/** Library shelf categories: GET list (seeds defaults), POST { name } add, DELETE ?id= (only when empty). */
export async function GET() {
  const guard = await requireApiRole(ROLES.library)
  if (!guard.ok) return guard.response
  return NextResponse.json({ categories: (await bookCategoriesFor(guard.schoolId)).map((c) => ({ id: c.id, name: c.name, books: c._count.books })) })
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.library, req)
  if (!guard.ok) return guard.response
  const parsed = z.object({ name: z.string().trim().min(2, 'Category name must be at least 2 characters').max(60) }).safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { schoolId } = guard
  const dup = await prisma.bookCategory.findFirst({ where: { schoolId, name: { equals: parsed.data.name, mode: 'insensitive' } } })
  if (dup) return NextResponse.json({ category: { id: dup.id, name: dup.name }, existed: true })
  const category = await prisma.bookCategory.create({ data: { schoolId, name: parsed.data.name } })
  await record(guard.session, { action: 'create', entity: 'BookCategory', entityId: category.id, summary: `Added library category "${category.name}"` })
  return NextResponse.json({ category: { id: category.id, name: category.name }, existed: false })
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.library, req)
  if (!guard.ok) return guard.response
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const cat = await prisma.bookCategory.findFirst({ where: { id, schoolId: guard.schoolId }, include: { _count: { select: { books: true } } } })
  if (!cat) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  if (cat._count.books > 0) return NextResponse.json({ error: `${cat._count.books} book(s) are on this shelf. Move them first.` }, { status: 409 })
  await prisma.bookCategory.delete({ where: { id } })
  await record(guard.session, { action: 'delete', entity: 'BookCategory', entityId: id, summary: `Removed library category "${cat.name}"` })
  return NextResponse.json({ success: true })
}
