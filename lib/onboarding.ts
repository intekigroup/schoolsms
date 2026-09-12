import { prisma } from '@/lib/db'

/**
 * The getting-started checklist for a new school. Each step is derived from
 * what is actually in the database, so it ticks itself as the office works
 * and never asks for something already done.
 */
export interface OnboardingStep { key: string; title: string; body: string; href: string; done: boolean }
export interface Onboarding { steps: OnboardingStep[]; done: number; total: number; complete: boolean; dismissed: boolean }

export async function onboardingFor(schoolId: string): Promise<Onboarding> {
  const [school, classes, subjects, staff, staffLogins, pupils, guardians, fees, reportSettings, notices, admins] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { logoUrl: true, phone: true, address: true, poBox: true, motto: true, onboarding: true, academicYears: { where: { isCurrent: true }, select: { id: true } } } }),
    prisma.class.count({ where: { schoolId } }),
    prisma.subject.count({ where: { schoolId } }),
    prisma.staff.count({ where: { schoolId } }),
    prisma.staff.count({ where: { schoolId, userId: { not: null } } }),
    prisma.student.count({ where: { schoolId } }),
    prisma.studentGuardian.count({ where: { student: { schoolId } } }),
    prisma.feeStructure.count({ where: { schoolId } }),
    prisma.reportSettings.count({ where: { schoolId } }),
    prisma.announcement.count({ where: { schoolId } }),
    prisma.user.count({ where: { schoolId, role: 'SCHOOL_ADMIN', emailVerified: { not: null } } }),
  ])
  const steps: OnboardingStep[] = [
    { key: 'verify', title: 'Confirm your email', body: 'The confirmation link in your inbox activates the account.', href: '/dashboard', done: admins > 0 },
    { key: 'year', title: 'Academic year and terms', body: 'Set up at registration. Adjust dates under Settings → Academic.', href: '/dashboard/academics', done: (school?.academicYears.length ?? 0) > 0 },
    { key: 'profile', title: 'School profile and logo', body: 'Phone, P.O. Box/address and logo print on every report card, receipt, payslip and ID card.', href: '/dashboard/settings', done: !!(school?.phone && (school?.address || school?.poBox) && school?.logoUrl) },
    { key: 'classes', title: 'Classes and subjects', body: 'Add your classes (streams too) and the subjects taught.', href: '/dashboard/classes', done: classes > 0 && subjects > 0 },
    { key: 'staff', title: 'Teachers and staff', body: 'Add staff, then give teachers a login and a teaching load.', href: '/dashboard/teachers', done: staff > 0 },
    { key: 'logins', title: 'Teacher logins', body: 'A teacher with a login sees their own classes, registers and mark sheets.', href: '/dashboard/teachers', done: staffLogins > 0 },
    { key: 'pupils', title: 'Enrol pupils', body: 'Add pupils one by one, or import the whole roll from Excel/CSV in one go.', href: '/dashboard/students', done: pupils > 0 },
    { key: 'guardians', title: 'Attach parents', body: 'Guardians receive SMS and can be given a portal login.', href: '/dashboard/parents', done: guardians > 0 },
    { key: 'fees', title: 'Fee structure', body: 'Tuition, boarding, transport — per class or school-wide — so receipts can be issued.', href: '/dashboard/fees', done: fees > 0 },
    { key: 'grading', title: 'Grading and report settings', body: 'Confirm the grade bands, CAT/exam weights and what prints on the report card.', href: '/dashboard/settings?tab=reports', done: reportSettings > 0 },
    { key: 'notice', title: 'First notice to parents', body: 'Post an announcement or send an SMS — parents notice the school has gone digital.', href: '/dashboard/communications', done: notices > 0 },
  ]
  const done = steps.filter((s) => s.done).length
  return { steps, done, total: steps.length, complete: done === steps.length, dismissed: !!(school?.onboarding as any)?.dismissed }
}
