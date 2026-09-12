import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { LibraryClient } from './library-client'
import { bookCategoriesFor } from '@/lib/library'
import { PAGE_SIZE, pageParam, pageArgs } from '@/lib/paging'

export const dynamic = 'force-dynamic'

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requirePageRole(ROLES.library)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const params = await searchParams
  const bookPage = pageParam(params, 'bp'), issuePage = pageParam(params, 'ip')
  const query = ((Array.isArray(params.q) ? params.q[0] : params.q) ?? '').trim()
  const bookWhere = {
    schoolId,
    ...(query ? { OR: [
      { title: { contains: query, mode: 'insensitive' as const } },
      { author: { contains: query, mode: 'insensitive' as const } },
      { isbn: { contains: query, mode: 'insensitive' as const } },
    ] } : {}),
  }
  const issueWhere = { book: { schoolId }, returnDate: null }

  const [categories, booksTotal, books, availableBooks, students, issuesTotal, overdueTotal, activeIssues] = await Promise.all([
    bookCategoriesFor(schoolId),
    prisma.book.count({ where: bookWhere }),
    prisma.book.findMany({ where: bookWhere, include: { _count: { select: { issues: true } } }, orderBy: { title: 'asc' }, ...pageArgs(bookPage) }),
    // The Issue dialog picks from every title with a copy on the shelf, whatever page the catalog is on.
    prisma.book.findMany({ where: { schoolId, available: { gt: 0 } }, select: { id: true, title: true, available: true }, orderBy: { title: 'asc' } }),
    prisma.student.findMany({ where: { schoolId, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true, admissionNo: true }, orderBy: { firstName: 'asc' } }),
    prisma.bookIssue.count({ where: issueWhere }),
    prisma.bookIssue.count({ where: { ...issueWhere, dueDate: { lt: new Date() } } }),
    prisma.bookIssue.findMany({ where: issueWhere, include: { book: true, student: true }, orderBy: { dueDate: 'asc' }, ...pageArgs(issuePage) }),
  ])

  return <LibraryClient
    categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    books={books.map((b: any) => ({
      id: b.id, title: b.title, author: b.author ?? '', isbn: b.isbn ?? '',
      category: b.category ?? '', categoryId: b.categoryId ?? '', totalCopies: b.totalCopies, available: b.available,
      issueCount: b._count?.issues ?? 0,
    }))}
    availableBooks={availableBooks}
    students={students.map((s: any) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo }))}
    issues={activeIssues.map((i: any) => ({
      id: i.id,
      bookTitle: i.book?.title ?? '',
      student: `${i.student?.firstName ?? ''} ${i.student?.lastName ?? ''}`,
      issueDate: i.issueDate?.toISOString() ?? '',
      dueDate: i.dueDate?.toISOString() ?? '',
      overdue: i.dueDate ? new Date(i.dueDate).getTime() < Date.now() : false,
    }))}
    query={query}
    pageSize={PAGE_SIZE}
    booksPage={bookPage} booksTotal={booksTotal}
    issuesPage={issuePage} issuesTotal={issuesTotal} overdueTotal={overdueTotal}
  />
}
