import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { schoolTodayStart, schoolTodayEnd } from '@/lib/school-time'
import { AdminDashboard } from './admin-dashboard'
import { TeacherDashboard } from './teacher-dashboard'
import { OnboardingChecklist } from '@/components/onboarding-checklist'
import { onboardingFor } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  
  const role = session.user.role
  const schoolId = session.user.schoolId

  if (role === 'SUPER_ADMIN') {
    redirect('/dashboard/super-admin')
  }

  if (role === 'PARENT') {
    redirect('/dashboard/parents')
  }

  // AdminDashboard below reports school-wide figures including fee collection,
  // so it must not be the landing page for a student. Timetable is the only
  // area a STUDENT currently has; a real student portal is still to be built.
  if (role === 'STUDENT') {
    redirect('/dashboard/my')
  }

  // Teachers get their own day, not the school's cash position.
  if (role === 'TEACHER' && schoolId) return <TeacherDashboard session={session} />

  if (!schoolId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No school assigned to your account.</p>
      </div>
    )
  }

  const [studentCount, staffCount, todayAttendance, feesCollected, pendingFees, recentStudents, recentPayments] = await Promise.all([
    prisma.student.count({ where: { schoolId, status: 'ACTIVE' } }),
    prisma.staff.count({ where: { schoolId, status: 'ACTIVE' } }),
    prisma.attendance.count({
      where: {
        class: { schoolId },
        date: {
          // Civil day in the school's timezone, not the server's.
          gte: schoolTodayStart(),
          lt: schoolTodayEnd(),
        },
        status: 'PRESENT',
      },
    }),
    prisma.feePayment.aggregate({
      where: { student: { schoolId }, paymentStatus: 'COMPLETED' },
      _sum: { amount: true },
    }),
    prisma.feePayment.aggregate({
      where: { student: { schoolId }, paymentStatus: 'PENDING' },
      _sum: { amount: true },
    }),
    prisma.student.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { class: true },
    }),
    prisma.feePayment.findMany({
      where: { student: { schoolId }, paymentStatus: 'COMPLETED' },
      orderBy: { paidAt: 'desc' },
      take: 5,
      include: { student: true, feeStructure: true },
    }),
  ])

  const stats = {
    studentCount,
    staffCount,
    todayAttendance,
    feesCollected: feesCollected._sum?.amount ?? 0,
    pendingFees: pendingFees._sum?.amount ?? 0,
    recentStudents: recentStudents.map((s: any) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      class: s.class?.name ?? 'Unassigned',
      status: s.status,
      admissionNo: s.admissionNo,
    })),
    recentPayments: recentPayments.map((p: any) => ({
      id: p.id,
      student: `${p.student?.firstName ?? ''} ${p.student?.lastName ?? ''}`,
      amount: p.amount,
      fee: p.feeStructure?.name ?? '',
      method: p.paymentMethod,
      date: p.paidAt?.toISOString() ?? '',
    })),
  }

  // New schools get a getting-started checklist until it is complete or hidden.
  const [onboarding, schoolRow] = role === 'SCHOOL_ADMIN' ? await Promise.all([onboardingFor(schoolId), prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } })]) : [null, null]
  return (
    <>
      {onboarding && <div className="mb-6"><OnboardingChecklist initial={onboarding} schoolName={schoolRow?.name ?? 'your school'} /></div>}
      <AdminDashboard stats={stats} />
    </>
  )
}
