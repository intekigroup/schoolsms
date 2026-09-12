import { prisma } from '@/lib/db'

/**
 * What one pupil owes, in one place.
 *
 * Billed = the school-wide fee structures plus the pupil's class's, less the
 * sibling discount: pupils who share a guardian in the same school are a
 * family; ranked eldest first, the second child gets `siblingSecondPct` off
 * every discountable fee and the third and later `siblingThirdPct`. Every
 * statement, invoice, receipt, portal balance and the debtors ageing report
 * call this so the numbers can never disagree.
 */
export interface Sibling { id: string; name: string; className: string | null; admissionNo: string; dateOfBirth: Date; rank: number }
export interface BillingLine { id: string; name: string; classId: string | null; dueDate: Date | null; amount: number; discountPct: number; discount: number; net: number; paid: number; balance: number }
export interface Billing {
  studentId: string; rank: number; siblings: Sibling[]; discountPct: number
  lines: BillingLine[]; gross: number; discount: number; billed: number; paid: number; balance: number
}

export async function feeSettingsFor(schoolId: string) {
  return (await prisma.feeSettings.findUnique({ where: { schoolId } })) ?? { siblingSecondPct: 0, siblingThirdPct: 0 }
}

/** Active pupils of the same school who share at least one guardian with this pupil, eldest first (the pupil included). */
export async function familyOf(studentId: string): Promise<Sibling[]> {
  const me = await prisma.student.findUnique({ where: { id: studentId }, select: { schoolId: true, guardians: { select: { guardianId: true } } } })
  if (!me) return []
  const guardianIds = me.guardians.map((g) => g.guardianId)
  const rows = await prisma.student.findMany({
    where: { schoolId: me.schoolId, status: 'ACTIVE', OR: [{ id: studentId }, ...(guardianIds.length ? [{ guardians: { some: { guardianId: { in: guardianIds } } } }] : [])] },
    select: { id: true, firstName: true, lastName: true, admissionNo: true, dateOfBirth: true, class: { select: { name: true } } },
    orderBy: [{ dateOfBirth: 'asc' }, { admissionNo: 'asc' }],
  })
  return rows.map((r, i) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`, className: r.class?.name ?? null, admissionNo: r.admissionNo, dateOfBirth: r.dateOfBirth, rank: i + 1 }))
}

export function discountFor(rank: number, settings: { siblingSecondPct: number; siblingThirdPct: number }) {
  return rank <= 1 ? 0 : rank === 2 ? settings.siblingSecondPct : settings.siblingThirdPct
}

export async function billingFor(studentId: string, opts: { asAt?: Date } = {}): Promise<Billing | null> {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, schoolId: true, classId: true, feePayments: { where: { paymentStatus: 'COMPLETED', ...(opts.asAt ? { paidAt: { lte: opts.asAt } } : {}) }, select: { amount: true, feeStructureId: true } } } })
  if (!s) return null
  const [structures, settings, family] = await Promise.all([
    prisma.feeStructure.findMany({ where: { schoolId: s.schoolId, OR: [{ classId: s.classId }, { classId: null }] }, orderBy: [{ dueDate: 'asc' }, { name: 'asc' }] }),
    feeSettingsFor(s.schoolId),
    familyOf(studentId),
  ])
  const rank = family.find((f) => f.id === studentId)?.rank ?? 1
  const discountPct = family.length > 1 ? discountFor(rank, settings) : 0
  const paidFor = new Map<string, number>()
  for (const p of s.feePayments) paidFor.set(p.feeStructureId, (paidFor.get(p.feeStructureId) ?? 0) + p.amount)
  const lines: BillingLine[] = structures.map((f) => {
    const pct = f.discountable ? discountPct : 0
    const discount = Math.round(f.amount * pct / 100)
    const net = f.amount - discount
    const paid = Math.min(net, paidFor.get(f.id) ?? 0)
    return { id: f.id, name: f.name, classId: f.classId, dueDate: f.dueDate, amount: f.amount, discountPct: pct, discount, net, paid, balance: net - paid }
  })
  const gross = lines.reduce((n, l) => n + l.amount, 0), discount = lines.reduce((n, l) => n + l.discount, 0)
  const billed = gross - discount
  // Overpayments against one fee still count as money received.
  const paid = s.feePayments.reduce((n, p) => n + p.amount, 0)
  return { studentId, rank, siblings: family.filter((f) => f.id !== studentId), discountPct, lines, gross, discount, billed, paid, balance: billed - paid }
}

/** Billing for every child of a guardian in one school, plus the family total. */
export async function familyBilling(guardianId: string, schoolId: string) {
  const links = await prisma.studentGuardian.findMany({ where: { guardianId, student: { schoolId, status: 'ACTIVE' } }, select: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, class: { select: { name: true } } } } }, orderBy: { student: { dateOfBirth: 'asc' } } })
  const children: { id: string; name: string; admissionNo: string; className: string | null; billing: Billing }[] = []
  for (const { student } of links) { const b = await billingFor(student.id); if (b) children.push({ id: student.id, name: `${student.firstName} ${student.lastName}`, admissionNo: student.admissionNo, className: student.class?.name ?? null, billing: b }) }
  const total = (k: 'gross' | 'discount' | 'billed' | 'paid' | 'balance') => children.reduce((n, c) => n + c.billing[k], 0)
  return { children, gross: total('gross'), discount: total('discount'), billed: total('billed'), paid: total('paid'), balance: total('balance') }
}

/** 1st, 2nd, 3rd, 4th … for 'child 2 of 3' wording on documents. */
export function ordinal(n: number) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}` }
