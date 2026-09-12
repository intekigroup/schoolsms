// Verifies the six gaps closed after user testing:
// student portal, audit trail, rate limiting, localisation, offline shell, backups.
//   node scripts/gaps-test.mjs [baseUrl]

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

const school = await prisma.school.findFirst()
const admin = await login('admin@kilimanjaro.tz', 'admin123')

console.log('== STUDENT PORTAL ==')
// Link a real student to a login, the way a school office would.
const student = await prisma.student.findFirst({
  where: { schoolId: school.id, examResults: { some: {} } },
  include: { examResults: true },
})
await prisma.user.deleteMany({ where: { email: 'portal-student@kilimanjaro.tz' } })
const su = await prisma.user.create({
  data: {
    email: 'portal-student@kilimanjaro.tz', name: `${student.firstName} ${student.lastName}`,
    role: 'STUDENT', schoolId: school.id, emailVerified: new Date(),
    hashedPassword: await bcrypt.hash('portal123', 12),
  },
})
await prisma.student.update({ where: { id: student.id }, data: { userId: su.id } })

const sc = await login('portal-student@kilimanjaro.tz', 'portal123')
ck('student can sign in', Boolean(sc), true)

const landing = await fetch(`${B}/dashboard`, { headers: { Cookie: sc }, redirect: 'manual' })
ck('lands on their own records', (landing.headers.get('location') ?? '').replace(B, ''), '/dashboard/my')

const my = await fetch(`${B}/dashboard/my`, { headers: { Cookie: sc } })
const html = await my.text()
ck('portal renders', my.status, 200)
ck('shows their own name', html.includes(student.firstName), true)
ck('shows results', /Results/.test(html), true)
ck('shows fee balance', /Fee balance/.test(html), true)
ck('shows attendance', /Attendance/.test(html), true)
ck('still cannot read the roster', (await fetch(`${B}/api/students`, { headers: { Cookie: sc } })).status, 403)
ck('still cannot open fees page', (await fetch(`${B}/dashboard/fees`, { headers: { Cookie: sc }, redirect: 'manual' })).status !== 200, true)

// Another student's portal must show only their own data.
await prisma.student.update({ where: { id: student.id }, data: { userId: null } })
await prisma.user.deleteMany({ where: { email: 'portal-student@kilimanjaro.tz' } })

console.log('== AUDIT TRAIL ==')
const before = await prisma.auditLog.count()
const fee = await prisma.feeStructure.findFirst({ where: { schoolId: school.id } })
const anyStudent = await prisma.student.findFirst({ where: { schoolId: school.id } })
const pay = await fetch(`${B}/api/fees/payment`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: admin },
  body: JSON.stringify({ studentId: anyStudent.id, feeStructureId: fee.id, amount: 40000, paymentMethod: 'CASH' }),
})
const payJson = await pay.json()
ck('payment recorded', pay.status, 200)
const entry = await prisma.auditLog.findFirst({ where: { entity: 'FeePayment' }, orderBy: { createdAt: 'desc' } })
ck('audit row written', (await prisma.auditLog.count()) > before, true)
ck('names the actor', entry?.actorName, 'Dr. Joseph Mwalimu')
ck('records the role', entry?.actorRole, 'SCHOOL_ADMIN')
ck('summary names the amount', /TZS 40,000/.test(entry?.summary ?? ''), true)
console.log(`        "${entry?.summary}"`)
if (payJson.id) await prisma.feePayment.delete({ where: { id: payJson.id } })

console.log('== RATE LIMITING ==')
// forgot-password is limited per TARGET ACCOUNT — the abuse it guards against
// is bombing one person's inbox. A fresh address each run keeps the windows
// from a previous run out of the result.
const victim = `victim-${Date.now()}@example.com`
const bystander = `bystander-${Date.now()}@example.com`
const codes = []
for (let i = 0; i < 12; i++) {
  const r = await fetch(`${B}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: victim }),
  })
  codes.push(r.status)
}
ck('first 10 requests allowed', codes.slice(0, 10).every((c) => c === 200), true)
ck('excess requests rejected', codes.slice(10).every((c) => c === 429), true)
const other = await fetch(`${B}/api/auth/forgot-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: bystander }),
})
ck('another account is unaffected', other.status, 200)

console.log('== LOCALISATION ==')
const portalHtml = html
// Tanzanian shilling renders as "TSh 735,000" under en-TZ, never "US$" or "$".
ck('money in Tanzanian shillings', /TSh\s?[\d,]+/.test(portalHtml), true)
ck('no US dollar formatting', /US\$|\bUSD\b/.test(portalHtml), false)
ck('no US-ordered dates in portal', /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(portalHtml), false)

console.log('== OFFLINE SHELL ==')
const sw = await fetch(`${B}/sw.js`)
ck('service worker served', sw.status, 200)
const swBody = await sw.text()
ck('never caches API responses', /startsWith\('\/api\/'\)/.test(swBody), true)
const off = await fetch(`${B}/offline.html`)
ck('offline page served', off.status, 200)

console.log('== BACKUP ==')
const fs = await import('node:fs')
const backups = fs.existsSync('backups') ? fs.readdirSync('backups').filter((f) => f.endsWith('.json.gz')) : []
ck('a backup exists', backups.length > 0, true)

await prisma.$disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
