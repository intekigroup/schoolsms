import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { FeesClient } from './fees-client'
import { feeSettingsFor } from '@/lib/fees/billing'
import { PAGE_SIZE, pageParam, pageArgs } from '@/lib/paging'

export const dynamic = 'force-dynamic'

export default async function FeesPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requirePageRole(ROLES.fees)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>
  const page = pageParam(await searchParams)

  const feeStructures = await prisma.feeStructure.findMany({
    where: { schoolId },
    include: { class: true, _count: { select: { payments: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const paymentsTotal = await prisma.feePayment.count({ where: { student: { schoolId } } })
  const recentPayments = await prisma.feePayment.findMany({
    where: { student: { schoolId } },
    include: { student: true, feeStructure: true },
    orderBy: { paidAt: 'desc' },
    ...pageArgs(page),
  })

  const totalCollected = await prisma.feePayment.aggregate({
    where: { student: { schoolId }, paymentStatus: 'COMPLETED' },
    _sum: { amount: true },
  })

  const pending = await prisma.feePayment.aggregate({
    where: { student: { schoolId }, paymentStatus: 'PENDING' },
    _sum: { amount: true },
  })

  const students = await prisma.student.findMany({
    where: { schoolId, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, admissionNo: true },
    orderBy: { firstName: 'asc' },
  })

  const classes = await prisma.class.findMany({
    where: { schoolId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return <FeesClient
    structures={feeStructures.map((f: any) => ({ id: f.id, name: f.name, amount: f.amount, className: f.class?.name ?? 'All', paymentCount: f._count?.payments ?? 0, discountable: f.discountable !== false }))}
    feeSettings={await feeSettingsFor(schoolId)}
    canEdit={session.user.role === 'SCHOOL_ADMIN'}
    payments={recentPayments.map((p: any) => ({
      id: p.id, student: `${p.student?.firstName ?? ''} ${p.student?.lastName ?? ''}`,
      amount: p.amount, method: p.paymentMethod, status: p.paymentStatus,
      fee: p.feeStructure?.name ?? '', date: p.paidAt?.toISOString() ?? '', receiptNo: p.receiptNo ?? '',
    }))}
    totalCollected={totalCollected._sum?.amount ?? 0}
    totalPending={pending._sum?.amount ?? 0}
    students={students.map((s: any) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo }))}
    classes={classes.map((c: any) => ({ id: c.id, name: c.name }))}
    page={page} pageSize={PAGE_SIZE} paymentsTotal={paymentsTotal}
  />
}
