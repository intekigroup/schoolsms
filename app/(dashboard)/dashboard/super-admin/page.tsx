import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { SuperAdminClient } from './super-admin-client'
import { isSaas } from '@/lib/edition'
import { PAGE_SIZE, pageParam, pageArgs } from '@/lib/paging'

export const dynamic = 'force-dynamic'

export default async function SuperAdminPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard')
  const params = await searchParams
  const schoolsPage = pageParam(params, 'sp'), invoicesPage = pageParam(params, 'ip')

  const [schoolCount, userCount, activeSubscriptions, schools, invoicesTotal, invoices, invoiced, collected] = await Promise.all([
    prisma.school.count(),
    prisma.user.count(),
    prisma.schoolSubscription.count({ where: { status: 'ACTIVE' } }),
    prisma.school.findMany({
      include: { subscription: true, _count: { select: { students: true, staff: true, users: true } } },
      orderBy: { createdAt: 'desc' },
      ...pageArgs(schoolsPage),
    }),
    prisma.invoice.count(),
    prisma.invoice.findMany({
      include: { payments: true, school: { select: { name: true } } },
      orderBy: { issuedAt: 'desc' },
      ...pageArgs(invoicesPage),
    }),
    // Outstanding across every live invoice, not just the page on screen.
    prisma.invoice.aggregate({ where: { status: { not: 'VOID' } }, _sum: { amount: true } }),
    prisma.invoicePayment.aggregate({ where: { invoice: { status: { not: 'VOID' } } }, _sum: { amount: true } }),
  ])

  return <SuperAdminClient
    saas={isSaas()}
    stats={{ schoolCount, userCount, activeSubscriptions }}
    pageSize={PAGE_SIZE}
    schoolsPage={schoolsPage} schoolsTotal={schoolCount}
    invoicesPage={invoicesPage} invoicesTotal={invoicesTotal}
    outstanding={(invoiced._sum.amount ?? 0) - (collected._sum.amount ?? 0)}
    schools={schools.map((s: any) => ({
      id: s.id, name: s.name, city: s.city ?? '', isActive: s.isActive,
      plan: s.subscription?.plan ?? 'FREE', status: s.subscription?.status ?? 'ACTIVE',
      monthlyAmount: s.subscription?.monthlyAmount ?? null, pricingNotes: s.subscription?.pricingNotes ?? '',
      students: s._count?.students ?? 0, staff: s._count?.staff ?? 0,
      createdAt: s.createdAt?.toISOString() ?? '',
    }))}
    invoices={invoices.map((i: any) => {
      const paid = i.payments.reduce((sum: number, p: any) => sum + p.amount, 0)
      return {
        id: i.id, number: i.number, schoolName: i.school.name, plan: i.plan,
        amount: i.amount, paid, outstanding: i.amount - paid, status: i.status,
        periodStart: i.periodStart.toISOString().slice(0, 10),
        periodEnd: i.periodEnd.toISOString().slice(0, 10),
        dueAt: i.dueAt.toISOString().slice(0, 10),
      }
    })}
  />
}
