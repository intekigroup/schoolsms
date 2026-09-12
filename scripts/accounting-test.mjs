// Accounting: chart, ledger, automatic postings from fees and payroll, expenses, budgets, statements.
//   node scripts/accounting-test.mjs [baseUrl]

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
  const r = await fetch(`${B}/api/auth/callback/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${B}/dashboard` }), redirect: 'manual' })
  keep(r); const out = cookie(); return out.includes('session-token') ? out : null
}
async function pdfText(bytes) {
  const doc = await PDFDocument.load(bytes); let out = ''
  doc.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (!(obj instanceof PDFRawStream)) return
    let s; try { s = Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1') } catch { return }
    for (const m of s.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out += Buffer.from(m[1], 'hex').toString('latin1') + '\n'
  })
  return { text: out, pages: doc.getPageCount() }
}
const api = async (path, cookie, init = {}) => {
  const r = await fetch(B + path, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) }, redirect: 'manual' })
  const type = r.headers.get('content-type') ?? ''
  const body = type.includes('pdf') ? Buffer.from(await r.arrayBuffer()) : type.includes('json') ? await r.json().catch(() => ({})) : await r.text()
  return { status: r.status, type, body, disposition: r.headers.get('content-disposition') }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
// A throwaway school of its own, so every ledger figure below is exact and the
// demo school's data is never touched.
const TAG = 'ACC'
const SCHOOL_NAME = `Ledger Test ${TAG}`
async function cleanup() {
  const schools = await prisma.school.findMany({ where: { name: SCHOOL_NAME }, select: { id: true } })
  for (const { id: sid } of schools) {
    const users = (await prisma.user.findMany({ where: { schoolId: sid }, select: { id: true } })).map((u) => u.id)
    await prisma.budget.deleteMany({ where: { schoolId: sid } })
    await prisma.expense.deleteMany({ where: { schoolId: sid } })
    await prisma.journalEntry.deleteMany({ where: { schoolId: sid } })
    await prisma.ledgerAccount.deleteMany({ where: { schoolId: sid } })
    await prisma.accountingSettings.deleteMany({ where: { schoolId: sid } })
    await prisma.payrollRun.deleteMany({ where: { schoolId: sid } })
    await prisma.hrSettings.deleteMany({ where: { schoolId: sid } })
    await prisma.feePayment.deleteMany({ where: { student: { schoolId: sid } } })
    await prisma.notification.deleteMany({ where: { userId: { in: users } } })
    await prisma.student.deleteMany({ where: { schoolId: sid } })
    await prisma.feeStructure.deleteMany({ where: { schoolId: sid } })
    await prisma.class.deleteMany({ where: { schoolId: sid } })
    await prisma.staff.deleteMany({ where: { schoolId: sid } })
    await prisma.term.deleteMany({ where: { academicYear: { schoolId: sid } } })
    await prisma.academicYear.deleteMany({ where: { schoolId: sid } })
    await prisma.auditLog.deleteMany({ where: { schoolId: sid } })
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    await prisma.schoolSubscription.deleteMany({ where: { schoolId: sid } })
    await prisma.school.delete({ where: { id: sid } })
  }
}
await cleanup()

const school = await prisma.school.create({ data: { name: SCHOOL_NAME, city: 'Arusha', subscription: { create: { plan: 'BASIC', status: 'ACTIVE', maxStudents: 500, maxStaff: 50 } } } })
const adminUser = await prisma.user.create({ data: { email: `admin.${TAG.toLowerCase()}@ledger.tz`, name: 'Head', role: 'SCHOOL_ADMIN', hashedPassword: await bcrypt.hash('admin123', 10), schoolId: school.id, emailVerified: new Date() } })
const acctUser = await prisma.user.create({ data: { email: `bursar.${TAG.toLowerCase()}@ledger.tz`, name: 'Bursar', role: 'ACCOUNTANT', hashedPassword: await bcrypt.hash('acc123', 10), schoolId: school.id, emailVerified: new Date() } })
const teacherUser = await prisma.user.create({ data: { email: `teacher.${TAG.toLowerCase()}@ledger.tz`, name: 'T', role: 'TEACHER', hashedPassword: await bcrypt.hash('t123', 10), schoolId: school.id, emailVerified: new Date() } })
await prisma.academicYear.create({ data: { name: '2026', startDate: new Date('2026-01-05T00:00:00Z'), endDate: new Date('2026-12-04T00:00:00Z'), isCurrent: true, schoolId: school.id } })
const cls = await prisma.class.create({ data: { name: `Std 1 ${TAG}`, level: 'PRIMARY', schoolId: school.id } })
const pupilA = await prisma.student.create({ data: { admissionNo: `${TAG}-1`, firstName: 'Amani', lastName: `Test${TAG}`, gender: 'MALE', dateOfBirth: new Date('2018-01-01'), schoolId: school.id, classId: cls.id } })
const pupilB = await prisma.student.create({ data: { admissionNo: `${TAG}-2`, firstName: 'Bahati', lastName: `Test${TAG}`, gender: 'FEMALE', dateOfBirth: new Date('2018-01-01'), schoolId: school.id, classId: cls.id } })
const tuition = await prisma.feeStructure.create({ data: { name: `Tuition ${TAG}`, amount: 500_000, classId: cls.id, schoolId: school.id, dueDate: new Date('2026-01-15T00:00:00Z') } })
const boarding = await prisma.feeStructure.create({ data: { name: `Boarding ${TAG}`, amount: 300_000, classId: cls.id, schoolId: school.id, dueDate: new Date('2026-01-15T00:00:00Z') } })
const staff = await prisma.staff.create({ data: { employeeNo: `${TAG}-S1`, firstName: 'Neema', lastName: `Test${TAG}`, gender: 'FEMALE', role: 'Teacher', salary: 600_000, schoolId: school.id, status: 'ACTIVE' } })
const unpark = async () => {}

const admin = await login(adminUser.email, 'admin123')
const bursar = await login(acctUser.email, 'acc123')
const teach = await login(teacherUser.email, 't123')
ck('logins', !!admin && !!bursar && !!teach, true)
const n = (v) => Math.round(v)

try {
  console.log('\nChart of accounts')
  let r = await api('/api/accounting/accounts?balances=1', bursar)
  ck('accountant can read chart 200', r.status, 200)
  const chart = r.body.accounts
  ck('default chart seeded (42 accounts)', chart.length, 42)
  const byCode = (c) => chart.find((a) => a.code === c)
  ck('system accounts flagged', byCode('1000').isSystem && byCode('4000').isSystem && byCode('5000').isSystem, true)
  r = await api('/api/accounting/accounts', bursar, { method: 'POST', body: JSON.stringify({ code: '5250', name: 'Security services', type: 'EXPENSE', subtype: 'OPERATING' }) })
  ck('add account 200', r.status, 200)
  const security = r.body.account
  r = await api('/api/accounting/accounts', bursar, { method: 'POST', body: JSON.stringify({ code: '5250', name: 'Dup', type: 'EXPENSE' }) })
  ck('duplicate code 409', r.status, 409)
  r = await api('/api/accounting/accounts', bursar, { method: 'PATCH', body: JSON.stringify({ id: byCode('1000').id, active: false }) })
  ck('system account cannot be closed 400', r.status, 400)
  r = await api('/api/accounting/accounts', bursar, { method: 'PATCH', body: JSON.stringify({ id: byCode('1010').id, name: 'CRDB — main account' }) })
  ck('rename 200', r.body.account.name, 'CRDB — main account')
  r = await api('/api/accounting/accounts', teach)
  ck('teacher 403', r.status, 403)

  console.log('\nLedger rules')
  const acc = (await api('/api/accounting/accounts', bursar)).body.accounts
  const id = (c) => acc.find((a) => a.code === c).id
  r = await api('/api/accounting/journal', bursar, { method: 'POST', body: JSON.stringify({ date: '2026-01-01', memo: 'Opening balances', lines: [{ accountId: id('1010'), debit: 2_000_000 }, { accountId: id('1000'), debit: 150_000 }, { accountId: id('3000'), credit: 2_150_000 }] }) })
  ck('balanced opening entry posts 200', r.status, 200)
  ck('  numbered JE-2026-00001', r.body.entry.number, 'JE-2026-00001')
  r = await api('/api/accounting/journal', bursar, { method: 'POST', body: JSON.stringify({ date: '2026-01-02', memo: 'Unbalanced', lines: [{ accountId: id('1010'), debit: 100 }, { accountId: id('4900'), credit: 90 }] }) })
  ck('unbalanced entry 400', r.status, 400)
  ck('  message shows the difference', /does not balance/.test(r.body.error), true)
  r = await api('/api/accounting/journal', bursar, { method: 'POST', body: JSON.stringify({ date: '2026-01-02', memo: 'Both sides', lines: [{ accountId: id('1010'), debit: 100, credit: 100 }, { accountId: id('4900'), credit: 0 }] }) })
  ck('line with debit and credit 400', r.status, 400)
  r = await api('/api/accounting/journal', bursar, { method: 'POST', body: JSON.stringify({ date: '2026-01-02', memo: 'One line', lines: [{ accountId: id('1010'), debit: 100 }] }) })
  ck('single line 400', r.status, 400)
  r = await api('/api/accounting/journal', bursar, { method: 'POST', body: JSON.stringify({ date: '2026-01-02', memo: 'Foreign account', lines: [{ accountId: 'nope', debit: 100 }, { accountId: id('4900'), credit: 100 }] }) })
  ck('unknown account 400', r.status, 400)

  console.log('\nAutomatic fee postings')
  r = await api('/api/fees/payment', admin, { method: 'POST', body: JSON.stringify({ studentId: pupilA.id, feeStructureId: tuition.id, amount: 500_000, paymentMethod: 'CASH' }) })
  ck('fee receipt recorded 200', r.status, 200)
  const receipt1 = r.body
  r = await api('/api/fees/payment', admin, { method: 'POST', body: JSON.stringify({ studentId: pupilA.id, feeStructureId: boarding.id, amount: 300_000, paymentMethod: 'MPESA' }) })
  const receipt2 = r.body
  r = await api('/api/fees/payment', admin, { method: 'POST', body: JSON.stringify({ studentId: pupilB.id, feeStructureId: tuition.id, amount: 200_000, paymentMethod: 'BANK_TRANSFER' }) })
  r = await api('/api/accounting/journal?from=2026-01-01&to=2099-12-31&source=FEE', bursar)
  ck('three FEE entries posted automatically', r.body.entries.length, 3)
  const e1 = r.body.entries.find((e) => e.sourceId === receipt1.id)
  ck('  cash receipt: Dr 1000 cash / Cr 4000 tuition', e1.lines.map((l) => `${l.account.code}:${l.debit || -l.credit}`).sort().join(','), '1000:500000,4000:-500000')
  const e2 = r.body.entries.find((e) => e.sourceId === receipt2.id)
  ck('  M-Pesa boarding: Dr 1020 mobile / Cr 4010 boarding (keyword rule)', e2.lines.map((l) => `${l.account.code}:${l.debit || -l.credit}`).sort().join(','), '1020:300000,4010:-300000')
  ck('  memo carries receipt and pupil', e1.memo.includes(receipt1.receiptNo) && e1.memo.includes('Amani'), true)
  r = await api('/api/accounting/sync', bursar, { method: 'POST' })
  ck('sync is idempotent (0 new)', `${r.body.fees}/${r.body.payroll}`, '0/0')

  console.log('\nExpenses')
  r = await api('/api/accounting/expenses', bursar, { method: 'POST', body: JSON.stringify({ date: '2026-02-03', payee: 'TANESCO', description: 'Electricity February', amount: 180_000, accountId: id('5210'), paidFromId: id('1010'), reference: 'LUKU-8841' }) })
  ck('expense recorded 200', r.status, 200)
  ck('  numbered EXP-2026-00001', r.body.expense.number, 'EXP-2026-00001')
  const exp1 = r.body.expense
  r = await api('/api/accounting/expenses', bursar, { method: 'POST', body: JSON.stringify({ date: '2026-02-05', payee: 'Askari Ltd', description: 'Night guard', amount: 250_000, accountId: security.id, paidFromId: id('1000') }) })
  const exp2 = r.body.expense
  r = await api('/api/accounting/expenses', bursar, { method: 'POST', body: JSON.stringify({ date: '2026-02-05', payee: 'X', description: 'Wrong account', amount: 10, accountId: id('4000'), paidFromId: id('1000') }) })
  ck('income account as expense refused 400', r.status, 400)
  r = await api('/api/accounting/expenses', bursar, { method: 'POST', body: JSON.stringify({ date: '2026-02-05', payee: 'X', description: 'Paid from income', amount: 10, accountId: id('5210'), paidFromId: id('4000') }) })
  ck('paid-from must be an asset 400', r.status, 400)
  r = await api('/api/accounting/journal?from=2026-02-01&to=2026-02-28&source=EXPENSE', bursar)
  ck('expense entries posted', r.body.entries.length, 2)

  console.log('\nPayroll posting')
  r = await api('/api/hr/payroll', admin, { method: 'POST', body: JSON.stringify({ period: '2033-01' }) })
  const runId = r.body.run.id
  ck('payroll draft for exactly the fixture teacher', r.body.count, 1)
  await api('/api/hr/payroll', admin, { method: 'PATCH', body: JSON.stringify({ id: runId, action: 'approve' }) })
  r = await api('/api/accounting/journal?from=2026-01-01&to=2099-12-31&source=PAYROLL', bursar)
  ck('nothing posted while only approved', r.body.entries.length, 0)
  r = await api('/api/hr/payroll', admin, { method: 'PATCH', body: JSON.stringify({ id: runId, action: 'pay' }) })
  ck('marked paid', r.body.run.status, 'PAID')
  r = await api('/api/accounting/journal?from=2026-01-01&to=2099-12-31&source=PAYROLL', bursar)
  ck('payroll entry posted on pay', r.body.entries.length, 1)
  const pe = r.body.entries[0]
  const line = (c) => pe.lines.find((l) => l.account.code === c)
  // 600,000 gross: NSSF 60,000 + 60,000, taxable 540,000, PAYE 24,000, net 516,000, SDL 21,000, WCF 3,000
  ck('  Dr salaries 600,000', line('5000').debit, 600_000)
  ck('  Dr employer NSSF 60,000 · SDL 21,000 · WCF 3,000', `${line('5010').debit}/${line('5020').debit}/${line('5030').debit}`, '60000/21000/3000')
  ck('  Cr PAYE payable 24,000', line('2100').credit, 24_000)
  ck('  Cr NSSF payable 120,000 (both halves)', line('2110').credit, 120_000)
  ck('  Cr bank net 516,000', line('1010').credit, 516_000)
  const dr = pe.lines.reduce((s, l) => s + l.debit, 0), cr = pe.lines.reduce((s, l) => s + l.credit, 0)
  ck('  entry balances', dr === cr, true)

  console.log('\nStatements')
  r = await api('/api/accounting/reports?type=trial-balance&asAt=2099-12-31', bursar)
  ck('trial balance: debits = credits', r.body.totalDebit === r.body.totalCredit && r.body.totalDebit > 0, true)
  r = await api('/api/accounting/reports?type=income-statement&from=2026-01-01&to=2099-12-31', bursar)
  // Income 500k + 300k + 200k = 1,000,000; expenses 180k + 250k + 600k + 60k + 21k + 3k = 1,114,000
  ck('income 1,000,000', r.body.totalIncome, 1_000_000)
  ck('expenses 1,114,000', r.body.totalExpenses, 1_114_000)
  ck('deficit −114,000', r.body.surplus, -114_000)
  ck('  fee income grouped under FEES', r.body.income.find((g) => g.subtype === 'FEES').total, 1_000_000)
  r = await api('/api/accounting/reports?type=balance-sheet&asAt=2099-12-31', bursar)
  // Cash 150k + 500k − 250k = 400k; bank 2,000k + 200k − 180k − 516k = 1,504k; mobile 300k → assets 2,204,000
  ck('assets 2,204,000', r.body.totalAssets, 2_204_000)
  ck('liabilities 168,000 (PAYE 24k + NSSF 120k + SDL 21k + WCF 3k)', r.body.totalLiabilities, 168_000)
  ck('equity 2,150,000 − 114,000 = 2,036,000', r.body.totalEquity, 2_036_000)
  ck('balance sheet balances', r.body.balanced, true)
  r = await api(`/api/accounting/reports?type=ledger&accountId=${id('1000')}&from=2026-01-01&to=2099-12-31`, bursar)
  ck('cash book opening 0, closing 400,000', `${r.body.openingBalance}/${r.body.closingBalance}`, '0/400000')
  // Chronological: opening (Jan) → guard paid in cash (Feb) → today's receipt.
  ck('  running balance after each line, in date order', r.body.rows.map((x) => x.running).join(','), '150000,-100000,400000')
  r = await api(`/api/accounting/reports?type=ledger&accountId=${id('1000')}&from=2026-02-01&to=2099-12-31`, bursar)
  ck('  opening balance carried when period starts 1 Feb', r.body.openingBalance, 150_000)
  r = await api('/api/accounting/reports?type=income-statement&from=2026-02-01&to=2026-02-28', bursar)
  ck('period filter: February expenses only 430,000', `${r.body.totalIncome}/${r.body.totalExpenses}`, '0/430000')

  console.log('\nVoid')
  r = await api(`/api/accounting/expenses?id=${exp2.id}&reason=${encodeURIComponent('Duplicate invoice')}`, bursar, { method: 'DELETE' })
  ck('void expense 200', r.status, 200)
  r = await api('/api/accounting/reports?type=income-statement&from=2026-01-01&to=2099-12-31', bursar)
  ck('voided expense drops out (864,000)', r.body.totalExpenses, 864_000)
  r = await api('/api/accounting/reports?type=balance-sheet&asAt=2099-12-31', bursar)
  ck('cash restored to 650,000 and still balanced', `${r.body.assets.find((a) => a.code === '1000').balance}/${r.body.balanced}`, '650000/true')
  r = await api(`/api/accounting/expenses?id=${exp2.id}&reason=again`, bursar, { method: 'DELETE' })
  ck('void twice 400', r.status, 400)
  r = await api('/api/accounting/expenses', bursar)
  ck('expense list shows the void', r.body.expenses.find((e) => e.id === exp2.id).journalEntry.status, 'VOID')

  console.log('\nBudgets')
  r = await api('/api/accounting/budgets', bursar, { method: 'PUT', body: JSON.stringify({ fiscalYear: 2026, items: [{ accountId: id('4000'), amount: 5_000_000 }, { accountId: id('5210'), amount: 1_200_000 }, { accountId: id('5000'), amount: 7_000_000 }] }) })
  ck('budget saved 200', r.status, 200)
  r = await api('/api/accounting/budgets', bursar, { method: 'PUT', body: JSON.stringify({ fiscalYear: 2026, items: [{ accountId: id('1000'), amount: 1 }] }) })
  ck('budget on an asset refused 400', r.status, 400)
  r = await api('/api/accounting/reports?type=budget&fiscalYear=2026', bursar)
  const tu = r.body.rows.find((x) => x.code === '4000'), el = r.body.rows.find((x) => x.code === '5210')
  ck('tuition: budget 5m, actual 700k, variance −4.3m', `${tu.budget}/${tu.actual}/${tu.variance}`, '5000000/700000/-4300000')
  ck('electricity: 1.2m budget, 180k actual, variance +1.02m, 15%', `${el.budget}/${el.actual}/${el.variance}/${el.pct}`, '1200000/180000/1020000/15')

  console.log('\nDebtors ageing')
  // Payments are dated today, so ageing as at an earlier date sees nothing paid.
  r = await api('/api/accounting/reports?type=debtors&asAt=2026-04-30', bursar)
  ck('as at 30 Apr (before any receipt): Bahati owes the full 800,000', r.body.rows.find((x) => x.admissionNo === `${TAG}-2`).balance, 800_000)
  ck('  105 days from the 15 Jan due date → over 90 bucket', `${r.body.rows.find((x) => x.admissionNo === `${TAG}-2`).days}/${r.body.rows.find((x) => x.admissionNo === `${TAG}-2`).bucket}`, '105/d90')
  r = await api('/api/accounting/reports?type=debtors', bursar)
  const b = r.body.rows.find((x) => x.admissionNo === `${TAG}-2`)
  ck('as at today: Bahati owes 600,000 (800k expected − 200k paid)', b.balance, 600_000)
  ck('Amani fully paid → not a debtor', r.body.rows.some((x) => x.admissionNo === `${TAG}-1`), false)
  ck('bucket total', r.body.buckets.d90 >= 600_000, true)

  console.log('\nPDF & CSV')
  r = await api('/api/accounting/reports?type=income-statement&from=2026-01-01&to=2099-12-31&format=pdf', bursar)
  let pdf = await pdfText(r.body)
  ck('income statement PDF (surplus after the void)', r.type.includes('pdf') && pdf.text.includes('Surplus for the period') && pdf.text.includes('136,000'), true)
  r = await api('/api/accounting/reports?type=balance-sheet&asAt=2099-12-31&format=pdf', bursar)
  pdf = await pdfText(r.body)
  ck('balance sheet PDF has totals', pdf.text.includes('Total liabilities and equity'), true)
  r = await api(`/api/accounting/reports?type=ledger&accountId=${id('1000')}&from=2026-01-01&to=2099-12-31&format=pdf`, bursar)
  pdf = await pdfText(r.body)
  ck('cash book PDF titled as cash book', pdf.text.includes('CASH BOOK'), true)
  ck('  filename', r.disposition, 'attachment; filename="cash-book-1000.pdf"')
  r = await api('/api/accounting/reports?type=debtors&format=pdf', bursar)
  pdf = await pdfText(r.body)
  ck('debtors PDF lists Bahati', pdf.text.includes('Bahati'), true)
  r = await api('/api/accounting/reports?type=trial-balance&asAt=2099-12-31&format=csv', bursar)
  ck('trial balance CSV', r.type.includes('csv') && r.body.includes('"1000"'), true)
  r = await api('/api/accounting/reports?type=budget&fiscalYear=2026&format=pdf', bursar)
  pdf = await pdfText(r.body)
  ck('budget PDF', pdf.text.includes('Budget vs actual'.toUpperCase()) || pdf.text.includes('BUDGET VS ACTUAL'), true)

  console.log('\nSettings & access')
  r = await api('/api/settings/accounting', admin)
  const defaults = r.body.config
  r = await api('/api/settings/accounting', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, accounts: { ...defaults.accounts, cash: '9999' } } }) })
  ck('mapping to a missing code 400', r.status, 400)
  r = await api('/api/settings/accounting', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, autoPostFees: false } }) })
  ck('auto-post off saved', r.body.config.autoPostFees, false)
  r = await api('/api/fees/payment', admin, { method: 'POST', body: JSON.stringify({ studentId: pupilB.id, feeStructureId: tuition.id, amount: 100_000, paymentMethod: 'CASH' }) })
  r = await api('/api/accounting/journal?from=2026-01-01&to=2099-12-31&source=FEE', bursar)
  ck('receipt not posted while auto-post is off', r.body.entries.length, 3)
  await api('/api/settings/accounting', admin, { method: 'PUT', body: JSON.stringify({ reset: true }) })
  r = await api('/api/accounting/sync', bursar, { method: 'POST' })
  ck('sync catches it up (1 receipt)', r.body.fees, 1)
  r = await api('/api/settings/accounting', bursar, { method: 'PUT', body: JSON.stringify({ config: defaults }) })
  ck('accountant cannot change settings 403', r.status, 403)
  r = await api('/api/accounting/reports?type=overview', teach)
  ck('teacher cannot read statements 403', r.status, 403)
  r = await api('/api/accounting/reports?type=overview', null)
  ck('anonymous 401', r.status, 401)
  r = await api('/api/accounting/reports?type=overview', admin)
  ck('overview: cash total and debtors', r.body.cashTotal > 0 && r.body.debtors >= 1, true)
  const audit = await prisma.auditLog.count({ where: { schoolId: school.id, entity: { in: ['JournalEntry', 'Expense', 'LedgerAccount', 'Budget', 'AccountingSettings', 'FinancialReport'] } } })
  ck('audit trail across accounting', audit >= 15, true)
} finally {
  await unpark()
  await cleanup()
  await prisma.$disconnect()
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
