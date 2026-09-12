import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Subscription plan limits. The numbers have always been stored on
 * SchoolSubscription (and applied when a plan changes in /api/schools) but were
 * never checked at the point records are created — so a FREE school could hold
 * any number of students. These helpers close that.
 */

type Quota = 'students' | 'staff'

/**
 * Returns a 409 response when the school is at or over its plan limit for the
 * given quota, or null when there is room. Schools with no subscription row are
 * left unrestricted rather than blocked.
 */
export async function checkPlanLimit(schoolId: string, quota: Quota): Promise<NextResponse | null> {
  const subscription = await prisma.schoolSubscription.findUnique({
    where: { schoolId },
    select: { plan: true, maxStudents: true, maxStaff: true },
  })
  if (!subscription) return null

  const max = quota === 'students' ? subscription.maxStudents : subscription.maxStaff
  const used =
    quota === 'students'
      ? await prisma.student.count({ where: { schoolId } })
      : await prisma.staff.count({ where: { schoolId } })

  if (used >= max) {
    const label = quota === 'students' ? 'students' : 'staff members'
    return NextResponse.json(
      {
        error: `Your ${subscription.plan} plan allows ${max} ${label} and you have ${used}. Upgrade the plan to add more.`,
        limitReached: true,
        plan: subscription.plan,
        max,
        used,
      },
      { status: 409 }
    )
  }
  return null
}
