// Server-side paging on the long tables: 60+ rows of staff, books, fee payments and exams,
// page 1 holds 50 and page 2 the rest; ?q keeps working with ?bp on the library; the
// client-fetched lists (accounting, SMS, HR) return { page, pageSize, total }.
//   node scripts/pagination-test.mjs [baseUrl]

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
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
  return { status: r.status, body: type.includes('json') ? await r.json().catch(() => ({})) : await r.text() }
}
const page = async (path, cookie) => { const r = await fetch(B + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' }); return { status: r.status, html: (await r.text()).replace(/<!--.*?-->/g, '') } }
const count = (html, re) => (html.match(re) ?? []).length
// "Showing 1–50 of 68" (or the raw keys if a locale lacks them) -> 68
const shownTotal = (html) => { const m = html.match(/1–50 (?:of|kati ya|common\.of) (\d+)/); return m ? Number(m[1]) : null }

const TAG = 'PGT'
const K = 'school-kilimanjaro'
const N = 60
const pad = (i) => String(i + 1).padStart(2, '0')
async function cleanup() {
  const students = (await prisma.student.findMany({ where: { admissionNo: { startsWith: `${TAG}-` } }, select: { id: true } })).map((s) => s.id)
  if (students.length) await prisma.feePayment.deleteMany({ where: { studentId: { in: students } } })
  await prisma.feeStructure.deleteMany({ where: { schoolId: K, name: { endsWith: ` ${TAG}` } } })
  await prisma.student.deleteMany({ where: { id: { in: students } } })
  const classes = (await prisma.class.findMany({ where: { schoolId: K, name: { endsWith: ` ${TAG}` } }, select: { id: true } })).map((c) => c.id)
  if (classes.length) { await prisma.examResult.deleteMany({ where: { exam: { classId: { in: classes } } } }); await prisma.exam.deleteMany({ where: { classId: { in: classes } } }) }
  await prisma.subject.deleteMany({ where: { schoolId: K, name: { endsWith: ` ${TAG}` } } })
  await prisma.class.deleteMany({ where: { id: { in: classes } } })
  await prisma.academicYear.deleteMany({ where: { schoolId: K, name: `Year ${TAG}` } })
  await prisma.staff.deleteMany({ where: { schoolId: K, employeeNo: { startsWith: `${TAG}-` } } })
  await prisma.book.deleteMany({ where: { schoolId: K, title: { startsWith: `AAA ${TAG} ` } } })
}
await cleanup()

// Fixtures: 60 of each, ordered so they land at the top of their tables (newest / alphabetically first).
for (let i = 0; i < N; i++) await prisma.staff.create({ data: { employeeNo: `${TAG}-${pad(i)}`, firstName: 'Staff', lastName: `${TAG} ${pad(i)}`, gender: 'MALE', schoolId: K } })
for (let i = 0; i < N; i++) await prisma.book.create({ data: { title: `AAA ${TAG} Book ${pad(i)}`, author: `Author ${TAG}`, isbn: `${TAG}${pad(i)}`, schoolId: K, totalCopies: 1, available: 1 } })
const cls = await prisma.class.create({ data: { name: `Std 9 ${TAG}`, level: 'PRIMARY', schoolId: K } })
const pupil = await prisma.student.create({ data: { admissionNo: `${TAG}-STU`, firstName: 'Pupil', lastName: TAG, gender: 'FEMALE', dateOfBirth: new Date('2014-01-01'), schoolId: K, classId: cls.id } })
const fee = await prisma.feeStructure.create({ data: { name: `Tuition ${TAG}`, amount: 1000, schoolId: K } })
for (let i = 0; i < N; i++) await prisma.feePayment.create({ data: { amount: 1000, paymentMethod: 'CASH', paymentStatus: 'COMPLETED', receiptNo: `${TAG}-R${pad(i)}`, schoolId: K, studentId: pupil.id, feeStructureId: fee.id, paidAt: new Date(Date.UTC(2099, 0, 1, 0, i)) } })
const subject = await prisma.subject.create({ data: { name: `Subject ${TAG}`, schoolId: K } })
const year = await prisma.academicYear.create({ data: { name: `Year ${TAG}`, startDate: new Date('2099-01-01T00:00:00Z'), endDate: new Date('2099-12-01T00:00:00Z'), schoolId: K } })
for (let i = 0; i < N; i++) await prisma.exam.create({ data: { name: `Exam ${TAG} ${pad(i)}`, type: 'CAT', classId: cls.id, subjectId: subject.id, academicYearId: year.id } })

const admin = await login('admin@kilimanjaro.tz', 'admin123')
ck('admin login', !!admin, true)

console.log('\n# Staff (?page)')
let p = await page('/dashboard/teachers', admin); ck('page 1 renders', p.status, 200)
ck('  50 fixture rows on page 1', count(p.html, /PGT-\d\d</g), 50)
const staffTotal = await prisma.staff.count({ where: { schoolId: K } })
ck('  paginator shows the full count', shownTotal(p.html), staffTotal)
p = await page('/dashboard/teachers?page=2', admin); ck('page 2 renders', p.status, 200)
ck('  remaining 10 fixture rows on page 2', count(p.html, /PGT-\d\d</g), 10)
ck('  page 2 holds the rest of the school', count(p.html, /hover:bg-muted\/30/g), Math.min(50, staffTotal - 50))
p = await page('/dashboard/teachers?q=PGT-0&page=1', admin); ck('search + page', p.status, 200)
ck('  ?q narrows to the 9 matching staff (01–09)', shownTotal(p.html) ?? count(p.html, /PGT-\d\d</g), 9)

console.log('\n# Library (?bp books, ?ip issues, ?q search)')
p = await page('/dashboard/library', admin); ck('page 1 renders', p.status, 200)
ck('  50 fixture books on page 1', count(p.html, /AAA PGT Book \d\d</g), 50)
p = await page('/dashboard/library?bp=2', admin); ck('page 2 renders', p.status, 200)
ck('  remaining 10 fixture books on page 2', count(p.html, /AAA PGT Book \d\d</g), 10)
p = await page('/dashboard/library?q=aaa+pgt', admin); ck('?q page 1 renders', p.status, 200)
ck('  search is server-side and paged: 50 of 60', count(p.html, /AAA PGT Book \d\d</g), 50)
ck('  paginator total = 60 matches', shownTotal(p.html), 60)
p = await page('/dashboard/library?q=aaa+pgt&bp=2', admin)
ck('  ?q survives ?bp=2: the last 10', count(p.html, /AAA PGT Book \d\d</g), 10)
ck('  a stale ?bp past the end shows nothing, no crash', (await page('/dashboard/library?q=aaa+pgt&bp=9', admin)).status, 200)
p = await page('/dashboard/library?q=Author+PGT+zzz', admin); ck('  no-match search shows the empty row', p.html.includes('No books found'), true)

console.log('\n# Fees (?page payments)')
p = await page('/dashboard/fees', admin); ck('page 1 renders', p.status, 200)
ck('  50 fixture receipts on page 1', count(p.html, /PGT-R\d\d</g), 50)
const payTotal = await prisma.feePayment.count({ where: { student: { schoolId: K } } })
ck('  paginator shows the full count', shownTotal(p.html), payTotal)
p = await page('/dashboard/fees?page=2', admin); ck('page 2 renders', p.status, 200)
ck('  remaining 10 fixture receipts on page 2', count(p.html, /PGT-R\d\d</g), 10)

console.log('\n# Exams (?page)')
p = await page('/dashboard/exams', admin); ck('page 1 renders', p.status, 200)
ck('  50 fixture exams on page 1', count(p.html, /Exam PGT \d\d</g), 50)
p = await page('/dashboard/exams?page=2', admin); ck('page 2 renders', p.status, 200)
ck('  remaining 10 fixture exams on page 2', count(p.html, /Exam PGT \d\d</g), 10)
p = await page('/dashboard/exams?q=Exam+PGT+0', admin); ck('  ?q narrows to 9 (01–09)', shownTotal(p.html) ?? count(p.html, /Exam PGT \d\d</g), 9)

console.log('\n# Client-fetched lists return { page, pageSize, total }')
let r = await api('/api/accounting/expenses?page=1&limit=5', admin); ck('expenses 200', r.status, 200)
ck('  shape', [r.body.page, r.body.pageSize, typeof r.body.total, Array.isArray(r.body.expenses)].join(','), '1,5,number,true')
r = await api('/api/accounting/journal?page=2&limit=3', admin); ck('journal 200', r.status, 200)
ck('  shape keeps entries/size and adds pageSize', [r.body.page, r.body.size, r.body.pageSize, typeof r.body.total, Array.isArray(r.body.entries)].join(','), '2,3,3,number,true')
r = await api('/api/accounting/journal?page=1&limit=1', admin); ck('  journal limit honoured', r.body.entries.length <= 1, true)
r = await api('/api/sms?page=1&limit=4', admin); ck('sms log 200', r.status, 200)
ck('  shape', [r.body.page, r.body.pageSize, typeof r.body.total, Array.isArray(r.body.logs)].join(','), '1,4,number,true')
r = await api('/api/hr/leave?year=2026&page=1&limit=5', admin); ck('hr leave 200', r.status, 200)
ck('  shape', [r.body.page, r.body.pageSize, typeof r.body.total, Array.isArray(r.body.requests)].join(','), '1,5,number,true')
r = await api('/api/hr/attendance?date=2026-09-01&page=2&limit=50', admin); ck('hr attendance register 200', r.status, 200)
ck('  paged staff: page 2 of the register', [r.body.page, r.body.pageSize, r.body.total >= 60, r.body.staff.length].join(','), `2,50,true,${Math.min(50, r.body.total - 50)}`)
r = await api('/api/hr/attendance?month=2026-09&page=1&limit=10', admin); ck('hr attendance month 200', r.status, 200)
ck('  shape', [r.body.page, r.body.pageSize, r.body.staff.length].join(','), '1,10,10')
r = await api('/api/hr/leave?year=2026&limit=99999', admin); ck('limit is clamped', r.body.pageSize <= 200, true)

console.log('\n# Tenant scoping and guards unchanged')
r = await page('/dashboard/teachers?page=1', null); ck('anonymous is redirected', r.status === 307 || r.status === 302, true)
const superc = await login('super@shulesms.tz', 'super123')
p = await page('/dashboard/super-admin?sp=1&ip=1', superc); ck('super-admin console pages render', p.status, 200)

await cleanup()
await prisma.$disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
