// Report card and fee statement PDFs.
//   node scripts/pdf-documents-test.mjs [baseUrl]

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const bcrypt = require('../node_modules/bcryptjs')
const { PDFDocument, decodePDFRawStream, PDFRawStream } = require('../node_modules/pdf-lib')
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

/**
 * Pulls the visible text out of a PDF. pdf-lib compresses content streams and
 * writes strings as hex, so the raw bytes are not greppable — decompress each
 * stream, then decode the <...> hex literals that precede a Tj/TJ operator.
 */
async function pdfText(bytes) {
  const doc = await PDFDocument.load(bytes)
  let out = ''
  doc.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (!(obj instanceof PDFRawStream)) return
    let stream
    try { stream = Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1') } catch { return }
    for (const m of stream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      out += Buffer.from(m[1], 'hex').toString('latin1') + '\n'
    }
  })
  return out
}

const get = async (path, cookie) => {
  const r = await fetch(B + path, { headers: cookie ? { Cookie: cookie } : {} })
  const buf = Buffer.from(await r.arrayBuffer())
  return { status: r.status, type: r.headers.get('content-type'), disposition: r.headers.get('content-disposition'), buf }
}

const admin = await login('admin@kilimanjaro.tz', 'admin123')
const school = await prisma.school.findFirst()

// A pupil who actually has results and payments, so the documents have content.
const student = await prisma.student.findFirst({
  where: { schoolId: school.id, examResults: { some: {} }, feePayments: { some: {} } },
  include: { examResults: { include: { subject: true } }, feePayments: true, class: true },
})
  ?? await prisma.student.findFirst({ where: { schoolId: school.id, examResults: { some: {} } }, include: { examResults: { include: { subject: true } }, feePayments: true, class: true } })

console.log(`subject: ${student.firstName} ${student.lastName} (${student.admissionNo})`)
console.log(`         ${student.examResults.length} results, ${student.feePayments.length} payments\n`)

console.log('== REPORT CARD ==')
const rc = await get(`/api/reports/report-card?studentId=${student.id}`, admin)
ck('generated', rc.status, 200)
ck('served as a PDF', rc.type, 'application/pdf')
ck('downloads with a sensible filename (carries the term)', /^attachment; filename="report-card-.+-Term-\d\.pdf"$/.test(rc.disposition), true)
ck('is a real PDF', rc.buf.subarray(0, 5).toString(), '%PDF-')

const rcDoc = await PDFDocument.load(rc.buf)
ck('has at least one page', rcDoc.getPageCount() >= 1, true)
ck('A4 sized', Math.round(rcDoc.getPage(0).getWidth()), 595)

const rcText = await pdfText(rc.buf)
ck('names the school', rcText.includes(school.name.toUpperCase()), true)
ck('titled as a report card', /REPORT CARD/.test(rcText), true)
ck('names the pupil', rcText.includes(`${student.firstName} ${student.lastName}`), true)
ck('shows the admission number', rcText.includes(student.admissionNo), true)
const subject = student.examResults[0]?.subject?.name
ck(`lists a subject (${subject})`, rcText.includes(subject), true)
// The engine prints the weighted term percentage, not raw marks out of total.
ck('shows a mark %', /MARK %/.test(rcText) && /GRADE/.test(rcText), true)
ck('shows an average', /Average/.test(rcText), true)
ck('has signature lines', /Class teacher/.test(rcText) && /Head teacher/.test(rcText), true)
ck('footer names the class and term', /Term \d/.test(rcText) && rcText.includes('Printed'), true)

console.log('== FEE STATEMENT ==')
const fs = await get(`/api/reports/fee-statement?studentId=${student.id}`, admin)
ck('generated', fs.status, 200)
ck('served as a PDF', fs.type, 'application/pdf')
ck('downloads with a sensible filename', fs.disposition, `attachment; filename="fee-statement-${student.admissionNo}.pdf"`)

const fsText = await pdfText(fs.buf)
ck('titled as a fee statement', /FEE STATEMENT/.test(fsText), true)
ck('names the pupil', fsText.includes(`${student.firstName} ${student.lastName}`), true)
ck('has a charges section', /CHARGES/.test(fsText), true)
ck('has a payments section', /PAYMENTS RECEIVED/.test(fsText), true)
ck('money in shillings', /TZS [\d,]+/.test(fsText), true)
ck('states a balance', /Balance/.test(fsText), true)
ck('marked not a receipt', /Not a receipt/.test(fsText), true)
if (student.feePayments[0]?.receiptNo) {
  ck('lists a real receipt number', fsText.includes(student.feePayments[0].receiptNo), true)
}

// The arithmetic on the page must match the database.
const structures = await prisma.feeStructure.findMany({
  where: { schoolId: school.id, OR: [{ classId: student.classId }, { classId: null }] },
})
const billed = structures.reduce((s, x) => s + x.amount, 0)
const paid = student.feePayments.reduce((s, x) => s + x.amount, 0)
const fmt = (n) => `TZS ${Math.round(n).toLocaleString('en-GB')}`
ck(`billed total matches the database (${fmt(billed)})`, fsText.includes(fmt(billed)), true)
ck(`balance matches the database (${fmt(billed - paid)})`, fsText.includes(fmt(billed - paid)), true)

console.log('== WHO CAN PRINT WHAT ==')
// A pupil may print their own, and only their own.
await prisma.user.deleteMany({ where: { email: 'pdf-pupil@kilimanjaro.tz' } })
const su = await prisma.user.create({
  data: {
    email: 'pdf-pupil@kilimanjaro.tz', name: `${student.firstName} ${student.lastName}`,
    role: 'STUDENT', schoolId: school.id, emailVerified: new Date(),
    hashedPassword: await bcrypt.hash('pdfpupil123', 12),
  },
})
await prisma.student.update({ where: { id: student.id }, data: { userId: su.id } })
const pupil = await login('pdf-pupil@kilimanjaro.tz', 'pdfpupil123')

const ownCard = await get('/api/reports/report-card', pupil)
ck('a pupil can print their own report card', ownCard.status, 200)
ck('and their own statement', (await get('/api/reports/fee-statement', pupil)).status, 200)
const other = await prisma.student.findFirst({ where: { schoolId: school.id, id: { not: student.id } }, select: { id: true } })
ck('but not another pupil\'s card', (await get(`/api/reports/report-card?studentId=${other.id}`, pupil)).status, 403)
ck('nor another pupil\'s statement', (await get(`/api/reports/fee-statement?studentId=${other.id}`, pupil)).status, 403)

const parent = await login('parent@kilimanjaro.tz', 'parent123')
ck('a parent cannot print arbitrary cards', (await get(`/api/reports/report-card?studentId=${other.id}`, parent)).status, 403)
ck('anonymous rejected', (await get(`/api/reports/report-card?studentId=${student.id}`)).status, 401)

// Cross-tenant: a pupil id from another school must not resolve.
const outside = await prisma.school.create({ data: { id: 'pdf-outside-school', name: 'Outside School' } })
const outsideStudent = await prisma.student.create({
  data: { firstName: 'Out', lastName: 'Side', gender: 'MALE', dateOfBirth: new Date('2012-01-01'), admissionNo: 'PDF-OUT-1', schoolId: outside.id },
})
ck('cross-school pupil is a 404', (await get(`/api/reports/report-card?studentId=${outsideStudent.id}`, admin)).status, 404)

console.log('== AUDIT ==')
const entry = await prisma.auditLog.findFirst({ where: { entity: 'ReportCard' }, orderBy: { createdAt: 'desc' } })
ck('printing a report card is audited', /Generated a report card/.test(entry?.summary ?? ''), true)
const stmt = await prisma.auditLog.findFirst({ where: { entity: 'FeeStatement' }, orderBy: { createdAt: 'desc' } })
ck('printing a statement is audited', /Generated a fee statement/.test(stmt?.summary ?? ''), true)

// Cleanup.
await prisma.student.update({ where: { id: student.id }, data: { userId: null } })
await prisma.user.deleteMany({ where: { email: 'pdf-pupil@kilimanjaro.tz' } })
await prisma.student.deleteMany({ where: { id: outsideStudent.id } })
await prisma.school.deleteMany({ where: { id: outside.id } })

await prisma.$disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
