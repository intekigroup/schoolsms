import { prisma } from '@/lib/db'

/** Shelf categories a Tanzanian school library starts with; the office can add its own. */
export const DEFAULT_BOOK_CATEGORIES = [
  'Textbooks', 'Reference', 'Kiswahili literature', 'English literature', 'Science', 'Mathematics',
  'Social studies', 'Religious', 'Story books', 'Past papers', 'Teacher guides', 'General',
] as const

/** The school's categories, seeding the defaults the first time the library is opened. */
export async function bookCategoriesFor(schoolId: string) {
  const existing = await prisma.bookCategory.findMany({ where: { schoolId }, orderBy: { name: 'asc' }, select: { id: true, name: true, _count: { select: { books: true } } } })
  if (existing.length) return existing
  await prisma.bookCategory.createMany({ data: DEFAULT_BOOK_CATEGORIES.map((name) => ({ schoolId, name })), skipDuplicates: true })
  return prisma.bookCategory.findMany({ where: { schoolId }, orderBy: { name: 'asc' }, select: { id: true, name: true, _count: { select: { books: true } } } })
}
