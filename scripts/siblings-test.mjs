// Sibling features: family detection, sibling discount on every document and balance, family statement, office chips.
//   node scripts/siblings-test.mjs [baseUrl]

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const bcrypt = require('../node_modules/bcryptjs')
const { inflateSync } = require('node:zlib')
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
  const r = await fetch(`${B}/api/auth/callback/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${B}/dashboard` }), redirect: 'manual' })
  keep(r); const out = cookie(); return out.includes('session-token') ? out : null
}
const api = async (path, cookie, init = {}) => {
  const r = await fetch(B + path, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) }, redirect: 'manual' })
  const type = r.headers.get('content-type') ?? ''
  return { status: r.status, type, body: type.includes('json') ? await r.json().catch(() => ({})) : await r.arrayBuffer() }
}
const page = async (path, cookie) => { const r = await fetch(B + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' }); return { status: r.status, html: (await r.text()).replace(/<!--.*?-->/g, '') } }
const pdfText = (buf) => { const latin = Buffer.from(buf).toString('latin1'); let drawn = ''; for (const m of latin.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) { try { const x = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); for (const h of x.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) drawn += Buffer.from(h[1], 'hex').toString('latin1') + '\n' } catch {} } return drawn }

const TAG = 'SIB'
async function cleanup() {
  const school = await prisma.school.findFirst({ where: { name: `Sib School ${TAG}` }, select: { id: true } })
  if (!school) return
  const K = school.id
  const users = (await prisma.user.findMany({ where: { schoolId: K }, select: { id: true } })).map((u) => u.id)
  if (users.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } }); await prisma.notification.deleteMany({ where: { userId: { in: users } } }) }
  await prisma.feePayment.deleteMany({ where: { schoolId: K } })
  const students = (await prisma.student.findMany({ where: { schoolId: K }, select: { id: true } })).map((s) => s.id)
  if (students.length) { await prisma.studentGuardian.deleteMany({ where: { studentId: { in: students } } }); await prisma.student.deleteMany({ where: { id: { in: students } } }) }
  await prisma.guardian.deleteMany({ where: { lastName: `Guardian${TAG}` } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
  await prisma.feeStructure.deleteMany({ where: { schoolId: K } }); await prisma.class.deleteMany({ where: { schoolId: K } })
  await prisma.feeSettings.deleteMany({ where: { schoolId: K } }); await prisma.accountingSettings.deleteMany({ where: { schoolId: K } })
  await prisma.journalLine.deleteMany({ where: { entry: { schoolId: K } } }); await prisma.journalEntry.deleteMany({ where: { schoolId: K } }); await prisma.ledgerAccount.deleteMany({ where: { schoolId: K } })
  await prisma.academicYear.deleteMany({ where: { schoolId: K } })
  await prisma.schoolSubscription.deleteMany({ where: { schoolId: K } }); await prisma.school.delete({ where: { id: K } })
}
await cleanup()

// Fixtures in a throwaway school (so the demo school's school-wide fees don't apply): one family of three
// (eldest Amani 2012, Baraka 2014, Chiku 2016) and an only child Dua, all in one class.
const pw = await bcrypt.hash('pass1234', 10)
const school = await prisma.school.create({ data: { name: `Sib School ${TAG}`, schoolLevel: ['PRIMARY'], subscription: { create: { plan: 'FREE', maxStudents: 50, maxStaff: 10 } } } })
const K = school.id
await prisma.user.create({ data: { email: `admin.${TAG.toLowerCase()}@x.tz`, name: 'Admin SIB', role: 'SCHOOL_ADMIN', hashedPassword: pw, schoolId: K, emailVerified: new Date() } })
await prisma.user.create({ data: { email: `bursar.${TAG.toLowerCase()}@x.tz`, name: 'Bursar SIB', role: 'ACCOUNTANT', hashedPassword: pw, schoolId: K, emailVerified: new Date() } })
const cls = await prisma.class.create({ data: { name: `Std 4 ${TAG}`, level: 'PRIMARY', schoolId: K } })
const mk = (n, dob) => prisma.student.create({ data: { admissionNo: `${TAG}-${n}`, firstName: n, lastName: 'Family', gender: 'FEMALE', dateOfBirth: new Date(dob), schoolId: K, classId: cls.id } })
const amani = await mk('Amani', '2012-01-01'), baraka = await mk('Baraka', '2014-01-01'), chiku = await mk('Chiku', '2016-01-01'), dua = await mk('Dua', '2015-01-01')
const mamaUser = await prisma.user.create({ data: { email: `mama.${TAG.toLowerCase()}@x.tz`, name: 'Mama SIB', role: 'PARENT', hashedPassword: pw, schoolId: K, emailVerified: new Date() } })
const mama = await prisma.guardian.create({ data: { firstName: 'Mama', lastName: `Guardian${TAG}`, phone: '+255700000333', relationship: 'Mother', userId: mamaUser.id, students: { create: [{ studentId: amani.id, isPrimary: true }, { studentId: baraka.id, isPrimary: true }, { studentId: chiku.id, isPrimary: true }] } } })
// Baba is linked only to Chiku — families are the union of guardians, so Chiku is still 3rd of 3.
await prisma.guardian.create({ data: { firstName: 'Baba', lastName: `Guardian${TAG}`, phone: '+255700000334', students: { create: [{ studentId: chiku.id }] } } })
const tuition = await prisma.feeStructure.create({ data: { name: `Tuition ${TAG}`, amount: 100000, schoolId: K, classId: cls.id, dueDate: new Date('2026-10-01') } })
const uniform = await prisma.feeStructure.create({ data: { name: `Uniform ${TAG}`, amount: 20000, schoolId: K, classId: cls.id, discountable: false } })
await prisma.feePayment.create({ data: { studentId: baraka.id, schoolId: K, feeStructureId: tuition.id, amount: 30000, receiptNo: `RCP-${TAG}-1` } })

const admin = await login(`admin.${TAG.toLowerCase()}@x.tz`, 'pass1234')
const bursar = await login(`bursar.${TAG.toLowerCase()}@x.tz`, 'pass1234')
const parent = await login(`mama.${TAG.toLowerCase()}@x.tz`, 'pass1234')
ck('logins', !!(admin && bursar && parent), true)

console.log('\n# Policy')
let r = await api('/api/fees/settings', admin); ck('GET fee settings (defaults 0/0)', `${r.status} ${r.body.siblingSecondPct}/${r.body.siblingThirdPct}`, '200 0/0')
r = await api('/api/fees/settings', admin, { method: 'PUT', body: JSON.stringify({ siblingSecondPct: 10, siblingThirdPct: 25 }) }); ck('PUT 10% / 25%', `${r.status} ${r.body.siblingSecondPct}/${r.body.siblingThirdPct}`, '200 10/25')
r = await api('/api/fees/settings', admin, { method: 'PUT', body: JSON.stringify({ siblingSecondPct: 150, siblingThirdPct: 0 }) }); ck('150% -> 400', r.status, 400)
r = await api('/api/fees/settings', bursar, { method: 'PUT', body: JSON.stringify({ siblingSecondPct: 5, siblingThirdPct: 5 }) }); ck('accountant cannot change the policy', r.status, 403)
r = await api('/api/fees', admin, { method: 'PATCH', body: JSON.stringify({ id: uniform.id, discountable: false }) }); ck('PATCH structure discountable', `${r.status} ${r.body.discountable}`, '200 false')

console.log('\n# Billing per child (tuition 100,000 discountable, uniform 20,000 excluded)')

// The helper is TypeScript; exercise it through the documents instead.
const inv = async (id, c = admin) => { const x = await api(`/api/fees/invoice?studentId=${id}`, c); return { status: x.status, text: x.status === 200 ? pdfText(x.body) : '' } }
let d = await inv(amani.id); ck('eldest: no discount, due 120,000', d.status === 200 && /120,000/.test(d.text) && !/Sibling discount/.test(d.text), true)
d = await inv(baraka.id); ck('2nd child: 10% off tuition → net 90,000 + 20,000; paid 30,000; due 80,000', /10,000/.test(d.text) && /80,000/.test(d.text) && /Sibling discount applied: 10%/.test(d.text), true)
d = await inv(chiku.id); ck('3rd child (via two guardians): 25% off → tuition 75,000 + 20,000 = 95,000', /25,000/.test(d.text) && /95,000/.test(d.text) && /3rd child/.test(d.text), true)
d = await inv(dua.id); ck('only child: no discount', /120,000/.test(d.text) && !/Sibling discount/.test(d.text), true)
let st = await api(`/api/reports/fee-statement?studentId=${baraka.id}`, admin); ck('fee statement carries the discount column', /DISCOUNT/.test(pdfText(st.body)) && /2nd child of 3/.test(pdfText(st.body)), true)
const pay = await prisma.feePayment.findFirst({ where: { receiptNo: `RCP-${TAG}-1` } })
st = await api(`/api/fees/receipt?paymentId=${pay.id}`, admin); const rt = pdfText(st.body); ck('receipt balance after payment = 110,000 − 30,000 = 80,000', /80,000/.test(rt) && /after 10% sibling discount/.test(rt), true)

console.log('\n# Portals and office')
let p = await page('/dashboard/parents', parent); ck('parent card shows the discount line', /Sibling discount 10%/.test(p.html) && /Sibling discount 25%/.test(p.html), true)
ck('  family statement button (3 children)', p.html.includes(`/api/fees/family-statement?schoolId=${K}`) && /\(3\)/.test(p.html), true)
ck('  balances net of discount', /80,000/.test(p.html), true)
r = await api('/api/fees/family-statement', parent); ck('parent downloads the family statement', `${r.status} ${r.type.includes('pdf')}`, '200 true')
const ft = pdfText(r.body); ck('  lists the three children and the family balance', /Amani Family/.test(ft) && /Chiku Family/.test(ft) && /Family balance/.test(ft) && /295,000/.test(ft), true)
r = await api(`/api/fees/family-statement?guardianId=${mama.id}`, admin); ck('office prints a guardian\'s family statement', r.status, 200)
r = await api(`/api/fees/family-statement?guardianId=nope`, admin); ck('unknown guardian -> 404', r.status, 404)
p = await page(`/dashboard/students?q=Family`, admin); ck('students table shows sibling chips', /2 sibling\(s\)/.test(p.html), true); ck('  only child has none', !/Dua Family[^<]*<span[^>]*>\d+ sibling/.test(p.html), true)
p = await page('/dashboard/fees', admin); ck('fees page has the sibling discount card', p.html.includes('Sibling discount') && p.html.includes('2nd child'), true)
r = await api('/api/accounting/reports?type=debtors', admin); ck('debtors ageing uses net amounts', r.status === 200 && JSON.stringify(r.body).includes('"balance":80000'), true)

await cleanup()
console.log(`\n${pass} passed, ${fail} failed`)
await prisma.$disconnect()
process.exit(fail ? 1 : 0)
