// Library shelf categories (select, not free text) and the teacher's pupils grouped by class.
//   node scripts/library-students-test.mjs [baseUrl]

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
  const r = await fetch(`${B}/api/auth/callback/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${B}/dashboard` }), redirect: 'manual' })
  keep(r); const out = cookie(); return out.includes('session-token') ? out : null
}
const api = async (path, cookie, init = {}) => {
  const r = await fetch(B + path, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) }, redirect: 'manual' })
  const type = r.headers.get('content-type') ?? ''
  return { status: r.status, body: type.includes('json') ? await r.json().catch(() => ({})) : await r.text() }
}
const page = async (path, cookie) => { const r = await fetch(B + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' }); return { status: r.status, html: (await r.text()).replace(/<!--.*?-->/g, '') } }

const TAG = 'LST'
const K = 'school-kilimanjaro'
async function cleanup() {
  const users = (await prisma.user.findMany({ where: { email: { endsWith: `.${TAG.toLowerCase()}@x.tz` } }, select: { id: true } })).map((u) => u.id)
  if (users.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } }); await prisma.notification.deleteMany({ where: { userId: { in: users } } }) }
  await prisma.class.updateMany({ where: { name: { endsWith: ` ${TAG}` } }, data: { classTeacherId: null } })
  await prisma.staffSubject.deleteMany({ where: { staff: { employeeNo: { startsWith: `${TAG}-` } } } })
  await prisma.staff.deleteMany({ where: { employeeNo: { startsWith: `${TAG}-` } } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
  await prisma.student.deleteMany({ where: { admissionNo: { startsWith: `${TAG}-` } } })
  await prisma.class.deleteMany({ where: { name: { endsWith: ` ${TAG}` } } })
  const books = (await prisma.book.findMany({ where: { title: { endsWith: ` ${TAG}` } }, select: { id: true } })).map((b) => b.id)
  if (books.length) { await prisma.bookIssue.deleteMany({ where: { bookId: { in: books } } }); await prisma.book.deleteMany({ where: { id: { in: books } } }) }
  await prisma.bookCategory.deleteMany({ where: { schoolId: K, name: { endsWith: ` ${TAG}` } } })
}
await cleanup()

const admin = await login('admin@kilimanjaro.tz', 'admin123')

console.log('\n# Library categories')
let r = await api('/api/library/categories', admin); ck('GET categories', r.status, 200)
ck('  a list exists (defaults, or the shelves backfilled from existing books)', r.body.categories.length > 0, true)
r = await api('/api/library/categories', admin, { method: 'POST', body: JSON.stringify({ name: 'Textbooks' }) }); ck('  Textbooks shelf available', r.status, 200)
const textbooks = r.body.category
r = await api('/api/library', admin, { method: 'POST', body: JSON.stringify({ title: `Free text ${TAG}`, category: 'Science', totalCopies: 1 }) }); ck('book without categoryId -> 400', r.status, 400); ck('  field = categoryId', r.body.field, 'categoryId')
r = await api('/api/library', admin, { method: 'POST', body: JSON.stringify({ title: `Bogus ${TAG}`, categoryId: 'nope', totalCopies: 1 }) }); ck('book with unknown categoryId -> 400', r.status, 400)
r = await api('/api/library', admin, { method: 'POST', body: JSON.stringify({ title: `Physics Form 1 ${TAG}`, author: 'TIE', categoryId: textbooks.id, totalCopies: 3 }) })
ck('book with a shelf -> 200', r.status, 200); ck('  categoryId stored', r.body.categoryId, textbooks.id); ck('  display name mirrored', r.body.category, 'Textbooks'); ck('  available = copies', r.body.available, 3)
const book = r.body
r = await api('/api/library/categories', admin, { method: 'POST', body: JSON.stringify({ name: `Comics ${TAG}` }) }); ck('add a category', `${r.status} ${r.body.existed}`, '200 false')
const comics = r.body.category
r = await api('/api/library/categories', admin, { method: 'POST', body: JSON.stringify({ name: `comics ${TAG}` }) }); ck('same name, different case -> existing returned', `${r.status} ${r.body.existed} ${r.body.category.id === comics.id}`, '200 true true')
r = await api('/api/library/categories', admin, { method: 'POST', body: JSON.stringify({ name: 'X' }) }); ck('too-short name -> 400', r.status, 400)
r = await api('/api/library', admin, { method: 'PATCH', body: JSON.stringify({ id: book.id, categoryId: comics.id, totalCopies: 5 }) }); ck('move book to the new shelf + 5 copies', `${r.status} ${r.body.category} ${r.body.available}`, `200 Comics ${TAG} 5`)
r = await api(`/api/library/categories?id=${comics.id}`, admin, { method: 'DELETE' }); ck('delete a shelf with books -> 409', r.status, 409)
r = await api('/api/library', admin, { method: 'PATCH', body: JSON.stringify({ id: book.id, totalCopies: 0 }) }); ck('zero copies -> 400', r.status, 400)
r = await api(`/api/library?id=${book.id}`, admin, { method: 'DELETE' }); ck('delete book', r.status, 200)
r = await api(`/api/library/categories?id=${comics.id}`, admin, { method: 'DELETE' }); ck('delete the now-empty shelf', r.status, 200)
let p = await page('/dashboard/library', admin); ck('library page renders', p.status, 200); ck('  categories handed to the page', p.html.includes('\\"categories\\"') || p.html.includes('"categories"'), true)
const other = await prisma.school.findFirst({ where: { id: { not: K } }, select: { id: true } })
if (other) ck('categories are per school (none leaked from Kilimanjaro)', await prisma.bookCategory.count({ where: { schoolId: other.id, name: 'Textbooks' } }), 0)

console.log('\n# Teacher pupils grouped by class')
const pw = await bcrypt.hash('pass1234', 10)
const cA = await prisma.class.create({ data: { name: `Std 5A ${TAG}`, level: 'PRIMARY', schoolId: K } })
const cB = await prisma.class.create({ data: { name: `Std 5B ${TAG}`, level: 'PRIMARY', schoolId: K } })
const cC = await prisma.class.create({ data: { name: `Std 6 ${TAG}`, level: 'PRIMARY', schoolId: K } })
for (const [cls, names] of [[cA, ['Zawadi', 'Amani']], [cB, ['Baraka']], [cC, ['Neema']]]) for (const n of names) await prisma.student.create({ data: { admissionNo: `${TAG}-${cls.name.slice(4, 6).trim()}-${n}`, firstName: n, lastName: 'Pupil', gender: 'FEMALE', dateOfBirth: new Date('2015-01-01'), schoolId: K, classId: cls.id } })
const tUser = await prisma.user.create({ data: { email: `teacher.${TAG.toLowerCase()}@x.tz`, name: 'Teacher LST', role: 'TEACHER', hashedPassword: pw, schoolId: K, emailVerified: new Date() } })
const staff = await prisma.staff.create({ data: { employeeNo: `${TAG}-T`, firstName: 'Teacher', lastName: 'LST', gender: 'FEMALE', schoolId: K, userId: tUser.id } })
await prisma.class.update({ where: { id: cA.id }, data: { classTeacherId: staff.id } })
const subj = await prisma.subject.findFirst({ where: { schoolId: K } })
await prisma.staffSubject.create({ data: { staffId: staff.id, subjectId: subj.id, classId: cB.id } })
const teacher = await login(`teacher.${TAG.toLowerCase()}@x.tz`, 'pass1234')
p = await page('/dashboard/students', teacher); ck('teacher students page', p.status, 200)
const iA = p.html.indexOf(`Std 5A ${TAG}`), iB = p.html.indexOf(`Std 5B ${TAG}`), iZ = p.html.indexOf('Zawadi'), iBa = p.html.indexOf('Baraka')
ck('  class headings present for both classes', iA > 0 && iB > 0, true); ck('  5A heading precedes its pupils, then 5B', iA < iZ && iZ < iB && iB < iBa, true)
ck('  pupils sorted alphabetically within a class', p.html.indexOf('Amani') < p.html.indexOf('Zawadi'), true)
ck('  a class not on the load is absent', p.html.includes(`Std 6 ${TAG}`) || p.html.includes('Neema'), false)
ck('  grouped mode is on for the teacher', p.html.includes('\\"groupByClass\\":true') || p.html.includes('"groupByClass":true'), true)
p = await page(`/dashboard/students?classId=${cB.id}`, teacher); ck('filter to 5B shows Baraka only', p.html.includes('Baraka') && !p.html.includes('Zawadi'), true)
p = await page(`/dashboard/students?classId=${cC.id}`, teacher); ck('filter to a class off the load is ignored (still my pupils)', p.html.includes('Zawadi') && !p.html.includes('Neema'), true)
p = await page(`/dashboard/students?classId=${cC.id}`, admin); ck('office can filter any class', p.html.includes('Neema') && !p.html.includes('Zawadi'), true)
p = await page('/dashboard/students?q=Baraka', admin); ck('office list is flat (no group headings)', /uppercase tracking-wide[^>]*>Std 5B/.test(p.html), false)

await cleanup()
console.log(`\n${pass} passed, ${fail} failed`)
await prisma.$disconnect()
process.exit(fail ? 1 : 0)
