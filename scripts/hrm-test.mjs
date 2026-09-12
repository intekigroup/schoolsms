// HRM: settings, employment details, pay items, staff attendance, leave, payroll with PAYE/NSSF, payslips.
//   node scripts/hrm-test.mjs [baseUrl]

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
const school = await prisma.school.findUnique({ where: { id: 'school-kilimanjaro' } })
const TAG = 'HRM'
const ids = { staff: [], users: [] }
async function cleanup() {
  const sf = [...new Set([...ids.staff, ...(await prisma.staff.findMany({ where: { schoolId: school.id, employeeNo: { startsWith: `${TAG}-` } }, select: { id: true } })).map((s) => s.id)])]
  const us = [...new Set([...ids.users, ...(await prisma.user.findMany({ where: { email: { endsWith: `.${TAG.toLowerCase()}@kilimanjaro.tz` } }, select: { id: true } })).map((u) => u.id)])]
  const runs = (await prisma.payrollRun.findMany({ where: { schoolId: school.id, period: { startsWith: '2031-' } }, select: { id: true } })).map((r) => r.id)
  if (runs.length) {
    await prisma.journalEntry.deleteMany({ where: { source: 'PAYROLL', sourceId: { in: runs } } }) // the auto-posting
    await prisma.payrollRun.deleteMany({ where: { id: { in: runs } } }) // payslips cascade
  }
  if (sf.length) {
    await prisma.payslip.deleteMany({ where: { staffId: { in: sf } } })
    await prisma.staff.deleteMany({ where: { id: { in: sf } } }) // pay items, leave, attendance cascade
  }
  if (us.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: us } } }); await prisma.user.deleteMany({ where: { id: { in: us } } }) }
  await prisma.hrSettings.deleteMany({ where: { schoolId: school.id } })
}
await cleanup()

// Three staff with salaries chosen to land in different PAYE bands, plus one who resigned.
const mk = async (first, salary, extra = {}) => {
  const s = await prisma.staff.create({ data: { employeeNo: `${TAG}-${first.toUpperCase()}`, firstName: first, lastName: `Test${TAG}`, gender: 'FEMALE', role: 'Teacher', salary, schoolId: school.id, ...extra } })
  ids.staff.push(s.id); return s
}
const asha = await mk('Asha', 1_500_000, { bankName: 'CRDB', bankAccount: '0150123456', nssfNo: 'NSSF-001', tin: '123-456-789' })
const bakari = await mk('Bakari', 600_000)
const cecilia = await mk('Cecilia', 250_000)
const gone = await mk('Gone', 900_000, { status: 'RESIGNED' })
const teacherUser = await prisma.user.create({ data: { email: `asha.${TAG.toLowerCase()}@kilimanjaro.tz`, name: 'Asha', role: 'TEACHER', hashedPassword: await bcrypt.hash('teach123', 10), schoolId: school.id, emailVerified: new Date() } })
ids.users.push(teacherUser.id)
await prisma.staff.update({ where: { id: asha.id }, data: { userId: teacherUser.id } })
// An earlier approved leave for Asha this year: 5 working days.
const admin = await login('admin@kilimanjaro.tz', 'admin123')
const teach = await login(teacherUser.email, 'teach123')
ck('logins', !!admin && !!teach, true)

try {
  console.log('\nSettings')
  let r = await api('/api/settings/hr', admin)
  ck('GET defaults 200', r.status, 200)
  const defaults = r.body.config
  ck('default PAYE bands: 5, first 270,000 @ 0%', `${defaults.payroll.payeBrackets.length}/${defaults.payroll.payeBrackets[0].upTo}/${defaults.payroll.payeBrackets[0].rate}`, '5/270000/0')
  ck('NSSF 10/10, SDL 3.5, WCF 0.5', `${defaults.payroll.nssfEmployeeRate}/${defaults.payroll.nssfEmployerRate}/${defaults.payroll.sdlRate}/${defaults.payroll.wcfRate}`, '10/10/3.5/0.5')
  ck('annual leave 28 days', defaults.leaveTypes.find((t) => t.key === 'ANNUAL').daysPerYear, 28)
  r = await api('/api/settings/hr', teach, { method: 'PUT', body: JSON.stringify({ config: defaults }) })
  ck('teacher cannot PUT 403', r.status, 403)
  r = await api('/api/settings/hr', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, leaveTypes: [defaults.leaveTypes[0], defaults.leaveTypes[0]] } }) })
  ck('duplicate leave keys 400', r.status, 400)
  r = await api('/api/settings/hr', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, workingDays: [1, 2, 3, 4, 5, 6] } }) })
  ck('six-day week saved 200', r.status, 200)
  await api('/api/settings/hr', admin, { method: 'PUT', body: JSON.stringify({ reset: true }) })

  console.log('\nEmployment details & pay items')
  r = await api('/api/hr/staff', admin, { method: 'PATCH', body: JSON.stringify({ id: asha.id, employmentType: 'CONTRACT', department: 'Sciences', hireDate: '2024-01-15', contractEnd: '2026-10-31' }) })
  ck('PATCH employment 200', r.status, 200)
  ck('  stored', `${r.body.staff.employmentType}/${r.body.staff.department}/${r.body.staff.contractEnd.slice(0, 10)}`, 'CONTRACT/Sciences/2026-10-31')
  r = await api('/api/hr/staff', admin, { method: 'PATCH', body: JSON.stringify({ id: asha.id, hireDate: 'yesterday' }) })
  ck('bad date 400', r.status, 400)
  r = await api('/api/hr/staff', teach, { method: 'PATCH', body: JSON.stringify({ id: asha.id, department: 'X' }) })
  ck('teacher cannot edit 403', r.status, 403)
  r = await api('/api/hr/pay-items', admin, { method: 'POST', body: JSON.stringify({ staffId: asha.id, name: 'Housing allowance', kind: 'ALLOWANCE', amount: 300_000, taxable: true }) })
  ck('add taxable allowance 200', r.status, 200)
  r = await api('/api/hr/pay-items', admin, { method: 'POST', body: JSON.stringify({ staffId: asha.id, name: 'Transport (non-taxable)', kind: 'ALLOWANCE', amount: 100_000, taxable: false }) })
  ck('add non-taxable allowance 200', r.status, 200)
  r = await api('/api/hr/pay-items', admin, { method: 'POST', body: JSON.stringify({ staffId: asha.id, name: 'SACCOS loan', kind: 'DEDUCTION', amount: 50_000 }) })
  ck('add deduction 200', r.status, 200)
  const loanId = r.body.item.id
  r = await api('/api/hr/pay-items', admin, { method: 'POST', body: JSON.stringify({ staffId: 'nope', name: 'x', kind: 'ALLOWANCE', amount: 1 }) })
  ck('unknown staff 404', r.status, 404)
  r = await api(`/api/hr/staff?id=${asha.id}`, admin)
  ck('staff GET lists 3 pay items', r.body.staff[0].payItems.length, 3)

  console.log('\nStaff attendance')
  r = await api('/api/hr/attendance', admin, { method: 'PUT', body: JSON.stringify({ date: '2031-03-03', entries: [{ staffId: asha.id, status: 'PRESENT' }, { staffId: bakari.id, status: 'LATE', remarks: 'Traffic' }, { staffId: cecilia.id, status: 'ABSENT' }] }) })
  ck('mark register 200', r.status, 200)
  r = await api('/api/hr/attendance?date=2031-03-03', admin)
  ck('day register shows marks', r.body.staff.filter((s) => s.employeeNo.startsWith(TAG)).map((s) => s.status ?? '-').join(','), 'PRESENT,LATE,ABSENT')
  ck('  resigned staff not on register', r.body.staff.some((s) => s.employeeNo === `${TAG}-GONE`), false)
  await api('/api/hr/attendance', admin, { method: 'PUT', body: JSON.stringify({ date: '2031-03-04', entries: [{ staffId: cecilia.id, status: 'ABSENT' }] }) })
  r = await api('/api/hr/attendance?month=2031-03', admin)
  ck('month summary: Cecilia 2 absent', r.body.staff.find((s) => s.employeeNo === `${TAG}-CECILIA`).absent, 2)
  r = await api('/api/hr/attendance', admin, { method: 'PUT', body: JSON.stringify({ date: '2031-03-03', entries: [{ staffId: 'nope', status: 'PRESENT' }] }) })
  ck('unknown staff 404', r.status, 404)
  r = await api('/api/hr/attendance?date=2031-03-03', teach)
  ck('teacher cannot read register 403', r.status, 403)

  console.log('\nLeave')
  // Teacher requests own leave: Mon 3 Mar 2031 – Fri 14 Mar 2031 = 10 working days.
  r = await api('/api/hr/leave', teach, { method: 'POST', body: JSON.stringify({ type: 'ANNUAL', startDate: '2031-03-03', endDate: '2031-03-14', reason: 'Family visit to Mwanza' }) })
  ck('teacher requests own leave 200', r.status, 200)
  ck('  10 working days (weekend skipped)', r.body.request.days, 10)
  const req1 = r.body.request.id
  r = await api('/api/hr/leave', teach, { method: 'POST', body: JSON.stringify({ type: 'ANNUAL', startDate: '2031-03-10', endDate: '2031-03-11', reason: 'Overlapping' }) })
  ck('overlapping request 409', r.status, 409)
  r = await api('/api/hr/leave', teach, { method: 'POST', body: JSON.stringify({ type: 'ANNUAL', startDate: '2031-03-15', endDate: '2031-03-16', reason: 'Weekend only' }) })
  ck('weekend-only request 400', r.status, 400)
  r = await api('/api/hr/leave', teach, { method: 'POST', body: JSON.stringify({ type: 'PATERNITY', startDate: '2031-05-05', endDate: '2031-05-09', reason: 'Five days but only 3 allowed' }) })
  ck('over entitlement 400', r.status, 400)
  ck('  message names remaining days', /Only 3 day/.test(r.body.error), true)
  r = await api('/api/hr/leave', teach, { method: 'PATCH', body: JSON.stringify({ id: req1, action: 'approve' }) })
  ck('teacher cannot approve own 403', r.status, 403)
  r = await api(`/api/hr/leave?year=2031&status=PENDING`, admin)
  ck('admin sees pending request', r.body.requests.some((x) => x.id === req1), true)
  r = await api('/api/hr/leave', admin, { method: 'PATCH', body: JSON.stringify({ id: req1, action: 'approve', note: 'Enjoy' }) })
  ck('admin approves 200', `${r.status}/${r.body.request.status}`, '200/APPROVED')
  r = await api(`/api/hr/leave?balances=1&staffId=${asha.id}&year=2031`, admin)
  const annual = r.body.balances.find((b) => b.key === 'ANNUAL')
  ck('balance: 10 of 28 taken, 18 left', `${annual.taken}/${annual.entitlement}/${annual.remaining}`, '10/28/18')
  r = await api('/api/hr/leave?year=2031', teach)
  ck('teacher sees only own requests', r.body.requests.every((x) => x.staffId === asha.id) && r.body.requests.length === 1, true)
  r = await api('/api/hr/attendance?date=2031-03-05', admin)
  ck('register flags Asha as on leave that day', r.body.staff.find((s) => s.id === asha.id).onLeave, 'ANNUAL')
  r = await api('/api/hr/leave', admin, { method: 'POST', body: JSON.stringify({ staffId: bakari.id, type: 'SICK', startDate: '2031-04-01', endDate: '2031-04-01', reason: 'Malaria, on behalf' }) })
  ck('admin records leave on behalf 200', r.status, 200)
  const req2 = r.body.request.id
  r = await api('/api/hr/leave', admin, { method: 'PATCH', body: JSON.stringify({ id: req2, action: 'reject', note: 'No certificate' }) })
  ck('reject with note', `${r.body.request.status}/${r.body.request.reviewNote}`, 'REJECTED/No certificate')
  r = await api('/api/hr/leave', admin, { method: 'PATCH', body: JSON.stringify({ id: req2, action: 'approve' }) })
  ck('cannot re-review a closed request 400', r.status, 400)
  r = await api('/api/hr/leave', teach, { method: 'POST', body: JSON.stringify({ type: 'STUDY', startDate: '2031-06-02', endDate: '2031-06-03', reason: 'Exam' }) })
  const req3 = r.body.request.id
  r = await api('/api/hr/leave', teach, { method: 'PATCH', body: JSON.stringify({ id: req3, action: 'cancel' }) })
  ck('teacher withdraws own pending request', r.body.request.status, 'CANCELLED')

  console.log('\nPayroll — arithmetic (TRA 2024/25 bands)')
  // Asha: basic 1,500,000 + housing 300,000 (taxable) + transport 100,000 (non-taxable) = gross 1,900,000
  //   NSSF employee 10% of gross = 190,000; taxable = 1,800,000 − 190,000 = 1,610,000
  //   PAYE = 0 + 8%×250,000 (20,000) + 20%×240,000 (48,000) + 25%×240,000 (60,000) + 30%×610,000 (183,000) = 311,000
  //   net = 1,900,000 − 190,000 − 311,000 − 50,000 = 1,349,000
  // Bakari: 600,000; NSSF 60,000; taxable 540,000; PAYE = 20,000 + 20%×20,000 = 24,000; net 516,000
  // Cecilia: 250,000; NSSF 25,000; taxable 225,000; PAYE 0; net 225,000
  r = await api('/api/hr/payroll', admin, { method: 'POST', body: JSON.stringify({ period: '2031-03' }) })
  ck('create draft 200', r.status, 200)
  const runId = r.body.run.id
  const seeded = await prisma.staff.count({ where: { schoolId: school.id, status: { in: ['ACTIVE', 'ON_LEAVE'] } } })
  ck('  one payslip per active staff (resigned excluded)', r.body.count, seeded)
  r = await api(`/api/hr/payroll/${runId}`, admin)
  const slip = (no) => r.body.payslips.find((p) => p.employeeNo === `${TAG}-${no}`)
  const a = slip('ASHA'), b = slip('BAKARI'), c = slip('CECILIA')
  ck('Asha gross 1,900,000', a.gross, 1_900_000)
  ck('  NSSF employee 190,000', a.nssfEmployee, 190_000)
  ck('  taxable pay 1,610,000 (non-taxable allowance and NSSF excluded)', a.taxablePay, 1_610_000)
  ck('  PAYE 311,000', a.paye, 311_000)
  ck('  other deductions 50,000', a.otherDeductions, 50_000)
  ck('  net 1,349,000', a.net, 1_349_000)
  ck('  SDL 3.5% = 66,500 · WCF 0.5% = 9,500', `${a.sdl}/${a.wcf}`, '66500/9500')
  ck('  bank details frozen on slip', `${a.bankName}/${a.bankAccount}/${a.nssfNo}`, 'CRDB/0150123456/NSSF-001')
  ck('Bakari PAYE 24,000 · net 516,000', `${b.paye}/${b.net}`, '24000/516000')
  ck('Cecilia below threshold: PAYE 0 · net 225,000', `${c.paye}/${c.net}`, '0/225000')
  ck('resigned staff has no payslip', r.body.payslips.some((p) => p.employeeNo === `${TAG}-GONE`), false)
  ck('payslip numbers PS-2031-03-####', /^PS-2031-03-\d{4}$/.test(a.number), true)
  const totNet = r.body.payslips.reduce((s, p) => s + p.net, 0)
  ck('run total net = sum of slips', r.body.run.totalNet, totNet)

  console.log('\nPayroll — lifecycle')
  r = await api('/api/hr/payroll', admin, { method: 'POST', body: JSON.stringify({ period: '2031-03' }) })
  ck('duplicate period 409', r.status, 409)
  r = await api('/api/hr/payroll', admin, { method: 'POST', body: JSON.stringify({ period: '2031-13' }) })
  ck('bad period 400', r.status, 400)
  // Change the loan and recompute: draft follows current data.
  await api('/api/hr/pay-items', admin, { method: 'PATCH', body: JSON.stringify({ id: loanId, amount: 80_000 }) })
  r = await api('/api/hr/payroll', admin, { method: 'PATCH', body: JSON.stringify({ id: runId, action: 'recompute' }) })
  r = await api(`/api/hr/payroll/${runId}`, admin)
  ck('recompute picks up changed deduction (net 1,319,000)', r.body.payslips.find((p) => p.employeeNo === `${TAG}-ASHA`).net, 1_319_000)
  r = await api(`/api/hr/payroll/${runId}?format=payslip`, teach)
  ck('teacher cannot see own slip while draft 403', r.status, 403)
  r = await api('/api/hr/payroll', admin, { method: 'PATCH', body: JSON.stringify({ id: runId, action: 'pay' }) })
  ck('cannot pay before approval 400', r.status, 400)
  r = await api('/api/hr/payroll', admin, { method: 'PATCH', body: JSON.stringify({ id: runId, action: 'approve' }) })
  ck('approve 200', `${r.status}/${r.body.run.status}`, '200/APPROVED')
  await api('/api/hr/pay-items', admin, { method: 'PATCH', body: JSON.stringify({ id: loanId, amount: 999_999 }) })
  r = await api('/api/hr/payroll', admin, { method: 'PATCH', body: JSON.stringify({ id: runId, action: 'recompute' }) })
  ck('approved run refuses recompute (frozen) 400', r.status, 400)
  r = await api(`/api/hr/payroll?id=${runId}`, admin, { method: 'DELETE' })
  ck('approved run cannot be deleted 400', r.status, 400)
  r = await api(`/api/hr/payroll/${runId}?format=payslip`, teach)
  ck('teacher downloads own payslip once approved', `${r.status}/${r.type.includes('pdf')}`, '200/true')
  let pdf = await pdfText(r.body)
  ck('  one page, own name, net figure', pdf.pages === 1 && pdf.text.includes('Asha') && pdf.text.includes('1,319,000'), true)
  ck('  shows PAYE and NSSF lines', pdf.text.includes('PAYE') && pdf.text.includes('NSSF'), true)
  ck('  employer contributions listed', pdf.text.includes('Skills Development Levy'), true)
  ck('  not another person', pdf.text.includes('Bakari'), false)
  r = await api(`/api/hr/payroll/${runId}?format=payslip&staffId=${bakari.id}`, teach)
  pdf = await pdfText(r.body)
  ck('teacher asking for a colleague still gets own', pdf.text.includes('Asha') && !pdf.text.includes('Bakari'), true)
  r = await api(`/api/hr/payroll/${runId}?format=register`, teach)
  ck('teacher cannot get register 403', r.status, 403)
  r = await api(`/api/hr/payroll/${runId}?format=payslips`, admin)
  pdf = await pdfText(r.body)
  ck('admin: all payslips, one page each', pdf.pages, seeded)
  r = await api(`/api/hr/payroll/${runId}?format=register`, admin)
  pdf = await pdfText(r.body)
  ck('register PDF lists staff and remittances', pdf.text.includes('PAYE to TRA') && pdf.text.includes(`${TAG}-ASHA`), true)
  ck('  has employer-cost line', pdf.text.includes('Total employer cost'), true)
  r = await api(`/api/hr/payroll/${runId}?format=bank`, admin)
  ck('bank CSV', r.type.includes('csv') && r.body.includes('CRDB') && r.body.includes('0150123456') && r.body.includes('1319000'), true)
  ck('  filename', r.disposition, 'attachment; filename="bank-2031-03.csv"')
  r = await api('/api/hr/payroll', admin, { method: 'PATCH', body: JSON.stringify({ id: runId, action: 'pay' }) })
  ck('mark paid 200', `${r.status}/${r.body.run.status}`, '200/PAID')
  ck('  paidAt set', !!r.body.run.paidAt, true)
  r = await api('/api/hr/payroll', admin, { method: 'PATCH', body: JSON.stringify({ id: runId, action: 'reopen' }) })
  ck('paid run cannot be reopened 400', r.status, 400)
  r = await api('/api/hr/payroll', admin)
  ck('runs list shows the paid run', r.body.runs.find((x) => x.id === runId)?.status, 'PAID')

  console.log('\nSettings drive payroll')
  await api('/api/settings/hr', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, payroll: { ...defaults.payroll, sdlEnabled: false, nssfEmployeeRate: 0, nssfEmployerRate: 0, payeBrackets: [{ upTo: null, rate: 10 }] } } }) })
  r = await api('/api/hr/payroll', admin, { method: 'POST', body: JSON.stringify({ period: '2031-04' }) })
  r = await api(`/api/hr/payroll/${r.body.run.id}`, admin)
  const c2 = r.body.payslips.find((p) => p.employeeNo === `${TAG}-CECILIA`)
  ck('flat 10% PAYE, no NSSF, no SDL: Cecilia PAYE 25,000, net 225,000, sdl 0', `${c2.paye}/${c2.net}/${c2.sdl}/${c2.nssfEmployee}`, '25000/225000/0/0')
  await api('/api/settings/hr', admin, { method: 'PUT', body: JSON.stringify({ reset: true }) })

  console.log('\nAccess')
  r = await api('/api/hr/payroll', teach)
  ck('teacher cannot list payroll 403', r.status, 403)
  r = await api('/api/hr/payroll', null)
  ck('anonymous 401', r.status, 401)
  r = await api('/api/hr/staff', teach)
  ck('teacher cannot read HR records 403', r.status, 403)
  const audit = await prisma.auditLog.count({ where: { schoolId: school.id, entity: { in: ['PayrollRun', 'LeaveRequest', 'StaffAttendance', 'StaffPayItem', 'HrSettings'] } } })
  ck('audit trail across HR', audit >= 20, true)
} finally {
  await cleanup()
  await prisma.$disconnect()
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
