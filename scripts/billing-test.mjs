// Subscription billing: invoices, payments, expiry, and reactivation.
//   node scripts/billing-test.mjs [baseUrl]

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const bcrypt = require('../node_modules/bcryptjs')
const prisma = new PrismaClient()
const B = process.argv[2] ?? 'http://127.0.0.1:3000'

let pass = 0, fail = 0
function ck(label, actual, expected) {
  const ok = String(actual) === String(expected)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} -> ${actual}${ok ? '' : ` (want ${expected})`}`)
  ok ? pass++ : fail++
}

async function login(email, password) {
  const jar = new Map()
  const keep = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const [p] = c.split(';'); const i = p.indexOf('='); jar.set(p.slice(0, i), p.slice(i + 1)) } }
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const cr = await fetch(`${B}/api/auth/csrf`); keep(cr)
  const { csrfToken } = await cr.json()
  const r = await fetch(`${B}/api/auth/callback/credentials`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${B}/dashboard` }), redirect: 'manual',
  })
  keep(r)
  const out = cookie()
  return out.includes('session-token') ? out : null
}

const api = async (method, path, body, cookie, headers = {}) => {
  const r = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', ...headers, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null; try { json = await r.json() } catch {}
  return { status: r.status, json }
}

const SUFFIX = Date.now()
const superAdmin = await login('super@shulesms.tz', 'super123')
const adminA = await login('admin@kilimanjaro.tz', 'admin123')

console.log('== PROVISIONING RAISES THE FIRST INVOICE ==')
// Quoted from pupils + level and agreed with the school; there is no price list.
const created = await api('POST', '/api/schools', { name: `Billing School ${SUFFIX}`, plan: 'BASIC', monthlyAmount: 50000, pricingNotes: '180 pupils, primary' }, superAdmin)
ck('school created', created.status, 200)
const SID = created.json?.school?.id
ck('an invoice came with it', Boolean(created.json?.invoice?.number), true)
ck('priced from the agreed amount', created.json?.invoice?.amount, 50000)
console.log(`        ${created.json?.invoice?.number} · TZS ${created.json?.invoice?.amount?.toLocaleString('en-GB')}`)
const subAtStart = await prisma.schoolSubscription.findUnique({ where: { schoolId: SID } })
ck('subscription now has an end date', Boolean(subAtStart.endDate), true)

const schoolAdmin = await prisma.user.create({
  data: {
    email: `billing-${SUFFIX}@audit.tz`, name: 'Billing Admin', role: 'SCHOOL_ADMIN', schoolId: SID,
    emailVerified: new Date(), hashedPassword: await bcrypt.hash('billing12345', 12),
  },
})
const cls = await prisma.class.create({ data: { name: 'Bill Class', level: 'PRIMARY', capacity: 20, schoolId: SID } })
let cookie = await login(`billing-${SUFFIX}@audit.tz`, 'billing12345')

console.log('== THE SCHOOL CAN SEE ITS OWN BILL, AND ONLY ITS OWN ==')
const mine = await api('GET', '/api/billing', undefined, cookie)
ck('school admin sees invoices', mine.status, 200)
ck('exactly one, its own', mine.json?.invoices?.length, 1)
ck('scoped to this school', mine.json?.invoices?.[0]?.schoolId, SID)
const otherPeek = await api('GET', `/api/billing?schoolId=${(await prisma.school.findFirst({ where: { name: 'Kilimanjaro Academy' } })).id}`, undefined, cookie)
ck('cannot peek at another school by id', otherPeek.json?.invoices?.every((i) => i.schoolId === SID), true)
ck('a teacher cannot see billing at all', (await api('GET', '/api/billing', undefined, adminA)).json?.invoices?.every((i) => i.schoolId !== SID), true)

console.log('== VALIDATION ==')
const invoiceId = mine.json.invoices[0].id
ck('over-payment refused', (await api('POST', '/api/billing/payment', { invoiceId, amount: 999999 }, superAdmin)).status, 409)
ck('zero refused', (await api('POST', '/api/billing/payment', { invoiceId, amount: 0 }, superAdmin)).status, 400)
ck('fractional shillings refused', (await api('POST', '/api/billing/payment', { invoiceId, amount: 1000.5 }, superAdmin)).status, 400)
ck('a school admin cannot record payments', (await api('POST', '/api/billing/payment', { invoiceId, amount: 1000 }, cookie)).status, 403)
ck('a school admin cannot issue invoices', (await api('POST', '/api/billing', { schoolId: SID }, cookie)).status, 403)
ck('anonymous rejected', (await api('GET', '/api/billing', undefined, '')).status, 401)

console.log('== PART PAYMENT ==')
const part = await api('POST', '/api/billing/payment', { invoiceId, amount: 20000, method: 'MPESA', reference: 'MPESA-123' }, superAdmin)
ck('part payment accepted', part.status, 200)
ck('invoice still open', part.json?.status, 'ISSUED')
const afterPart = await api('GET', '/api/billing', undefined, cookie)
ck('paid so far recorded', afterPart.json?.invoices?.[0]?.paid, 20000)
ck('outstanding computed', afterPart.json?.invoices?.[0]?.outstanding, 30000)

console.log('== EXPIRY PUTS THE SCHOOL IN READ-ONLY ==')
// Wind the clock: the paid period has ended and money is still owed.
await prisma.schoolSubscription.update({ where: { schoolId: SID }, data: { endDate: new Date(Date.now() - 86_400_000) } })
await prisma.invoice.update({ where: { id: invoiceId }, data: { dueAt: new Date(Date.now() - 86_400_000) } })
const cycle = await api('POST', '/api/billing/run', {}, superAdmin)
ck('cycle ran', cycle.status, 200)
ck('invoice marked overdue', cycle.json?.markedOverdue >= 1, true)
ck('subscription expired', cycle.json?.expired?.some((n) => n.includes('Billing School')), true)
ck('status is EXPIRED', (await prisma.schoolSubscription.findUnique({ where: { schoolId: SID } })).status, 'EXPIRED')

// The enforcement built earlier should now bite, on the existing session.
ck('the school can still read', (await api('GET', '/api/students', undefined, cookie)).status, 200)
const blocked = await api('POST', '/api/students', { firstName: 'No', lastName: 'Write', admissionNo: `BL-${SUFFIX}` }, cookie)
ck('but cannot write', blocked.status, 402)
ck('and can still see the bill it owes', (await api('GET', '/api/billing', undefined, cookie)).json?.invoices?.[0]?.status, 'OVERDUE')

console.log('== PAYING RESTORES SERVICE ==')
const settle = await api('POST', '/api/billing/payment', { invoiceId, amount: 30000, method: 'BANK_TRANSFER' }, superAdmin)
ck('balance settled', settle.status, 200)
ck('invoice marked paid', settle.json?.status, 'PAID')
ck('subscription reactivated', settle.json?.reactivated, true)
ck('status back to ACTIVE', (await prisma.schoolSubscription.findUnique({ where: { schoolId: SID } })).status, 'ACTIVE')
const nowWrites = await api('POST', '/api/students', { firstName: 'Can', lastName: 'Write', admissionNo: `OK-${SUFFIX}` }, cookie)
ck('writes work again on the same session', nowWrites.status, 200)
if (nowWrites.json?.id) await prisma.student.delete({ where: { id: nowWrites.json.id } })
const reactivated = await prisma.schoolSubscription.findUnique({ where: { schoolId: SID } })
ck('and the end date is no longer in the past', reactivated.endDate > new Date(), true)

console.log('== THE CYCLE IS IDEMPOTENT ==')
const first = await api('POST', '/api/billing/run', {}, superAdmin)
const countAfterFirst = await prisma.invoice.count({ where: { schoolId: SID } })
const second = await api('POST', '/api/billing/run', {}, superAdmin)
ck('a second run issues nothing extra', await prisma.invoice.count({ where: { schoolId: SID } }), countAfterFirst)

console.log('== CRON CAN RUN IT WITHOUT A LOGIN ==')
ck('no secret, no session, rejected', (await api('POST', '/api/billing/run', {}, '')).status, 401)
ck('wrong secret rejected', (await api('POST', '/api/billing/run', {}, '', { 'x-billing-secret': 'wrong' })).status, 401)
if (process.env.BILLING_CRON_SECRET) {
  ck('correct secret accepted', (await api('POST', '/api/billing/run', {}, '', { 'x-billing-secret': process.env.BILLING_CRON_SECRET })).status, 200)
}

console.log('== VOIDING ==')
const extra = await api('POST', '/api/billing', { schoolId: SID, notes: 'Raised in error' }, superAdmin)
ck('platform can issue another invoice', extra.status, 200)
const extraId = (await prisma.invoice.findFirst({ where: { number: extra.json.invoice.number } })).id
ck('an unpaid invoice can be voided', (await api('DELETE', `/api/billing?id=${extraId}`, undefined, superAdmin)).status, 200)
ck('a paid invoice cannot be voided', (await api('DELETE', `/api/billing?id=${invoiceId}`, undefined, superAdmin)).status, 409)

console.log('== NO AGREED AMOUNT, NOTHING BILLED ==')
const freeSchool = await api('POST', '/api/schools', { name: `Free School ${SUFFIX}`, plan: 'BASIC' }, superAdmin)
ck('unquoted school provisions without an invoice', freeSchool.json?.invoice, null)
ck('and never expires', (await prisma.schoolSubscription.findUnique({ where: { schoolId: freeSchool.json.school.id } })).endDate, null)
ck('issuing one is refused until quoted', (await api('POST', '/api/billing', { schoolId: freeSchool.json.school.id }, superAdmin)).status, 400)
ck('the cycle skips it', (await api('POST', '/api/billing/run', {}, superAdmin)).json?.issued?.some((l) => l.includes('Free School')), false)
// Agree a price, and billing starts.
ck('quote can be set', (await api('PATCH', '/api/schools', { schoolId: freeSchool.json.school.id, monthlyAmount: 85000, pricingNotes: '300 pupils, primary + O-level' }, superAdmin)).status, 200)
ck('fractional quote refused', (await api('PATCH', '/api/schools', { schoolId: freeSchool.json.school.id, monthlyAmount: 85000.5 }, superAdmin)).status, 400)
const quoted = await api('POST', '/api/billing', { schoolId: freeSchool.json.school.id }, superAdmin)
ck('invoice issues at the quoted amount', quoted.json?.invoice?.amount, 85000)

console.log('== AUDIT ==')
const issued = await prisma.auditLog.findFirst({ where: { entity: 'Invoice', action: 'create' }, orderBy: { createdAt: 'desc' } })
ck('issuing is audited', /Issued invoice/.test(issued?.summary ?? ''), true)
const paid = await prisma.auditLog.findFirst({ where: { entity: 'InvoicePayment' }, orderBy: { createdAt: 'desc' } })
ck('payment is audited', /Received TZS/.test(paid?.summary ?? ''), true)
ck('reactivation noted in the audit', /reactivated/.test(paid?.summary ?? ''), true)

// Cleanup: both test schools and anything the cycle raised for the demo school.
for (const id of [SID, freeSchool.json.school.id]) {
  await prisma.invoicePayment.deleteMany({ where: { invoice: { schoolId: id } } })
  await prisma.invoice.deleteMany({ where: { schoolId: id } })
  await prisma.auditLog.deleteMany({ where: { schoolId: id } })
  await prisma.student.deleteMany({ where: { schoolId: id } })
  await prisma.class.deleteMany({ where: { schoolId: id } })
  await prisma.user.deleteMany({ where: { schoolId: id } })
  await prisma.schoolSubscription.deleteMany({ where: { schoolId: id } })
  await prisma.school.deleteMany({ where: { id } })
}

await prisma.$disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
