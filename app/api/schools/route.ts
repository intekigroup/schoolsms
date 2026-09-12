import { requireSuperAdmin } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { issueInvoice, addDays, PERIOD_DAYS, PLAN_LIMITS } from '@/lib/billing'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Create a new school (tenant) with an initial subscription
export async function POST(req: Request) {
  try {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const body = await req.json()
    const { name, city, region, email, phone, plan, monthlyAmount, pricingNotes } = body
    const agreed = Number.isInteger(monthlyAmount) && monthlyAmount > 0 ? monthlyAmount : null
    if (!name || !String(name).trim()) return NextResponse.json({ error: 'School name is required' }, { status: 400 })

    const chosenPlan = (plan && PLAN_LIMITS[plan]) ? plan : 'FREE'
    const limits = PLAN_LIMITS[chosenPlan]

    const school = await prisma.school.create({
      data: {
        name: String(name).trim(),
        city: city ?? null,
        region: region ?? null,
        email: email ?? null,
        phone: phone ?? null,
        isActive: true,
        subscription: {
          create: {
            plan: chosenPlan as any,
            status: 'ACTIVE',
            maxStudents: limits.maxStudents,
            maxStaff: limits.maxStaff,
            monthlyAmount: agreed,
            pricingNotes: pricingNotes ? String(pricingNotes).slice(0, 300) : null,
            // A quoted school starts a billing period immediately; an unquoted or free one never expires.
            endDate: agreed ? addDays(new Date(), PERIOD_DAYS) : null,
          },
        },
      },
      include: { subscription: true },
    })
    // Raise the first invoice once a price has been agreed.
    let invoice = null
    if (agreed) {
      invoice = await issueInvoice({ schoolId: school.id, periodStart: new Date(), notes: 'Initial subscription period' })
    }

    return NextResponse.json({ success: true, school, invoice: invoice ? { number: invoice.number, amount: invoice.amount } : null })
  } catch (e: any) {
    console.error('School POST error:', e)
    return NextResponse.json({ error: 'Failed to create school' }, { status: 500 })
  }
}

// Update a school's subscription plan / status, or activate/deactivate the tenant
export async function PATCH(req: Request) {
  try {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const body = await req.json()
    const { schoolId, plan, status, isActive, monthlyAmount, pricingNotes } = body
    if (!schoolId) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 })

    const school = await prisma.school.findUnique({ where: { id: schoolId }, include: { subscription: true } })
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

    // Update tenant active flag
    // The quoted price, agreed with the school. 0 or null clears it (nothing billed).
    if (monthlyAmount !== undefined || pricingNotes !== undefined) {
      const amount = monthlyAmount === null || monthlyAmount === 0 ? null : monthlyAmount
      if (amount !== null && (!Number.isInteger(amount) || amount < 0)) {
        return NextResponse.json({ error: 'Monthly amount must be a whole number of shillings' }, { status: 400 })
      }
      await prisma.schoolSubscription.update({
        where: { schoolId },
        data: {
          ...(monthlyAmount !== undefined ? { monthlyAmount: amount } : {}),
          ...(pricingNotes !== undefined ? { pricingNotes: pricingNotes ? String(pricingNotes).slice(0, 300) : null } : {}),
        },
      })
    }

    if (typeof isActive === 'boolean') {
      await prisma.school.update({ where: { id: schoolId }, data: { isActive } })
    }

    // Update or create subscription plan/status
    if (plan || status) {
      const limits = plan && PLAN_LIMITS[plan] ? PLAN_LIMITS[plan] : null
      if (school.subscription) {
        await prisma.schoolSubscription.update({
          where: { id: school.subscription.id },
          data: {
            ...(plan ? { plan: plan as any } : {}),
            ...(status ? { status: status as any } : {}),
            ...(limits ? { maxStudents: limits.maxStudents, maxStaff: limits.maxStaff } : {}),
          },
        })
      } else {
        await prisma.schoolSubscription.create({
          data: {
            schoolId,
            plan: (plan ?? 'FREE') as any,
            status: (status ?? 'ACTIVE') as any,
            maxStudents: limits?.maxStudents ?? 50,
            maxStaff: limits?.maxStaff ?? 10,
          },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('School PATCH error:', e)
    return NextResponse.json({ error: 'Failed to update school' }, { status: 500 })
  }
}
