import { startDoc, header, detailRows, table, footer, text, textRight, gap, rule, ensureRoom, tzs, A4, MARGIN, ACCENT, SOFT, INK, type SchoolHeader } from '@/lib/pdf'
import { periodLabel } from './payroll'
import type { Payslip, PayrollRun } from '@prisma/client'

type Line = { name: string; amount: number; taxable?: boolean }

/** One payslip per page — the document a staff member takes to a bank or a landlord. */
export async function renderPayslips(run: PayrollRun, slips: Payslip[], school: SchoolHeader, note: string, payDay: number): Promise<Uint8Array> {
  const doc = await startDoc(`Payslips · ${periodLabel(run.period)}`, school)
  const right = A4[0] - MARGIN
  slips.forEach((p, i) => {
    if (i > 0) { doc.page = doc.pdf.addPage(A4); doc.y = A4[1] - MARGIN }
    header(doc, school, `Payslip · ${periodLabel(run.period)}`)
    detailRows(doc, [
      ['NAME', p.staffName], ['EMPLOYEE NO', p.employeeNo],
      ['POSITION', p.role], ['PAYSLIP NO', p.number],
      ['NSSF NO', p.nssfNo ?? '—'], ['TIN', p.tin ?? '—'],
      ['BANK', p.bankName ? `${p.bankName} · ${p.bankAccount ?? ''}` : '—'], ['STATUS', run.status === 'PAID' ? `Paid` : run.status === 'APPROVED' ? 'Approved' : 'Draft'],
    ])
    gap(doc, 6)
    const allowances = p.allowances as unknown as Line[]
    const deductions = p.deductions as unknown as Line[]

    text(doc, 'EARNINGS', { size: 8, bold: true, color: SOFT }); gap(doc, 14)
    table(doc, [{ title: 'ITEM', width: 340 }, { title: 'TAXABLE', width: 60 }, { title: 'AMOUNT', width: 99, align: 'right' }], [
      ['Basic salary', 'Yes', tzs(p.basic)],
      ...allowances.map((a) => [a.name, a.taxable === false ? 'No' : 'Yes', tzs(a.amount)]),
    ])
    text(doc, 'Gross pay', { size: 9.5, bold: true }); textRight(doc, tzs(p.gross), right, { size: 9.5, bold: true }); gap(doc, 18)

    ensureRoom(doc, 120)
    text(doc, 'DEDUCTIONS', { size: 8, bold: true, color: SOFT }); gap(doc, 14)
    table(doc, [{ title: 'ITEM', width: 400 }, { title: 'AMOUNT', width: 99, align: 'right' }], [
      ['NSSF — employee contribution', tzs(p.nssfEmployee)],
      [`PAYE (taxable pay ${tzs(p.taxablePay)})`, tzs(p.paye)],
      ...deductions.map((d) => [d.name, tzs(d.amount)]),
    ])
    text(doc, 'Total deductions', { size: 9.5, bold: true }); textRight(doc, tzs(p.nssfEmployee + p.paye + p.otherDeductions), right, { size: 9.5, bold: true }); gap(doc, 20)

    ensureRoom(doc, 110)
    rule(doc, ACCENT); gap(doc, 20)
    text(doc, 'NET PAY', { size: 11, bold: true }); textRight(doc, tzs(p.net), right, { size: 14, bold: true, color: ACCENT }); gap(doc, 22)
    rule(doc); gap(doc, 16)
    text(doc, 'EMPLOYER CONTRIBUTIONS (NOT DEDUCTED FROM PAY)', { size: 8, bold: true, color: SOFT }); gap(doc, 14)
    const emp: [string, string][] = [['NSSF — employer', tzs(p.nssfEmployer)]]
    if (p.sdl) emp.push(['Skills Development Levy', tzs(p.sdl)])
    if (p.wcf) emp.push(['Workers Compensation Fund', tzs(p.wcf)])
    for (const [k, v] of emp) { text(doc, k, { size: 9 }); textRight(doc, v, right, { size: 9 }); gap(doc, 13) }
    gap(doc, 8)
    const paidLine = run.status === 'PAID' && run.paidAt
      ? `Paid on ${run.paidAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`
      : `Pay day: ${payDay} ${periodLabel(run.period)}.`
    text(doc, `${paidLine} ${note}`, { size: 8, color: SOFT })
  })
  footer(doc, `${school.name} · Payroll ${run.period} · Confidential`)
  return doc.pdf.save()
}

/** Landscape-free register: one row per staff member with statutory columns and totals. */
export async function renderRegister(run: PayrollRun, slips: Payslip[], school: SchoolHeader): Promise<Uint8Array> {
  const doc = await startDoc(`Payroll register · ${periodLabel(run.period)}`, school)
  header(doc, school, `Payroll register · ${periodLabel(run.period)} · ${run.status}`)
  const cols = [
    { title: 'STAFF', width: 135 }, { title: 'BASIC', width: 62, align: 'right' as const }, { title: 'GROSS', width: 62, align: 'right' as const },
    { title: 'NSSF', width: 55, align: 'right' as const }, { title: 'PAYE', width: 60, align: 'right' as const }, { title: 'OTHER', width: 55, align: 'right' as const }, { title: 'NET', width: 70, align: 'right' as const },
  ]
  const n = (v: number) => Math.round(v).toLocaleString('en-GB')
  table(doc, cols, slips.map((p) => [`${p.staffName} (${p.employeeNo})`, n(p.basic), n(p.gross), n(p.nssfEmployee), n(p.paye), n(p.otherDeductions), n(p.net)]), { emptyMessage: 'No staff on this run.' })
  const totalRow: string[] = ['TOTAL', n(run.totalBasic), n(run.totalGross), n(run.totalNssfEmployee), n(run.totalPaye), n(run.totalDeductions), n(run.totalNet)]
  let x = MARGIN
  cols.forEach((c, i) => { if (c.align === 'right') textRight(doc, totalRow[i], x + c.width, { size: 9.5, bold: true }); else text(doc, totalRow[i], { x, size: 9.5, bold: true }); x += c.width })
  gap(doc, 22)
  ensureRoom(doc, 120)
  text(doc, 'STATUTORY REMITTANCES', { size: 8, bold: true, color: SOFT }); gap(doc, 14)
  const right = A4[0] - MARGIN
  const lines: [string, number][] = [
    ['PAYE to TRA', run.totalPaye],
    ['NSSF — employee 10%', run.totalNssfEmployee],
    ['NSSF — employer', run.totalNssfEmployer],
    ['NSSF total to remit', run.totalNssfEmployee + run.totalNssfEmployer],
    ['SDL to TRA', run.totalSdl],
    ['WCF', run.totalWcf],
    ['Total employer cost (gross + employer NSSF + SDL + WCF)', run.totalGross + run.totalNssfEmployer + run.totalSdl + run.totalWcf],
  ]
  for (const [k, v] of lines) { text(doc, k, { size: 9.5, color: INK }); textRight(doc, tzs(v), right, { size: 9.5, bold: true }); gap(doc, 15) }
  footer(doc, `${school.name} · Payroll register ${run.period} · ${slips.length} staff · Confidential`)
  return doc.pdf.save()
}

/** Bank instruction file: one line per staff member with a bank account. */
export function bankCsv(run: PayrollRun, slips: Payslip[]): string {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [['Payslip', 'Employee No', 'Name', 'Bank', 'Account', 'Amount (TZS)', 'Reference'].map(esc).join(',')]
  for (const p of slips) rows.push([p.number, p.employeeNo, p.staffName, p.bankName ?? '', p.bankAccount ?? '', p.net, `SALARY ${run.period}`].map(esc).join(','))
  return rows.join('\n') + '\n'
}
