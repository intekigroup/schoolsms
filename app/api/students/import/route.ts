export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { checkPlanLimit } from '@/lib/plan-limits'
import { normaliseTzPhone } from '@/lib/sms/types'
import { PLAN_LIMITS } from '@/lib/billing'

/**
 * Bulk enrolment from a CSV (the sheet most schools already keep in Excel).
 *
 *   GET  ?template=1      the CSV template with a filled example row
 *   POST text/csv body    { dryRun?: '1' } via ?dryRun=1 to validate only
 *
 * Columns: admissionNo, firstName, lastName, gender (M/F), dateOfBirth
 * (YYYY-MM-DD or DD/MM/YYYY), class, guardianName, guardianPhone,
 * relationship. Missing classes are created; a guardian with the same phone
 * is reused so siblings share one parent record. Rows with problems are
 * reported by line and skipped; the rest are imported.
 */
const HEADERS = ['admissionNo', 'firstName', 'lastName', 'gender', 'dateOfBirth', 'class', 'guardianName', 'guardianPhone', 'relationship'] as const

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite)
  if (!guard.ok) return guard.response
  const csv = [HEADERS.join(','), 'KA-2026-001,Amina,Juma,F,2014-03-15,Std 1,Fatuma Juma,0745000001,Mother', 'KA-2026-002,Baraka,Mwita,M,15/07/2013,Std 2,Peter Mwita,0755000002,Father'].join('\n') + '\n'
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="pupils-template.csv"' } })
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function parseDate(s: string): Date | null {
  const t = s.trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  m = t.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
  return null
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.studentsWrite, req)
  if (!guard.ok) return guard.response
  const { schoolId, session } = guard
  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1'
  const text = (await req.text()).replace(/^﻿/, '')
  const rows = parseCsv(text)
  if (rows.length < 2) return NextResponse.json({ error: 'The file has no data rows. Download the template to see the expected columns.' }, { status: 400 })
  const head = rows[0].map((h) => h.trim().replace(/\s+/g, '').replace(/^\w/, (c) => c.toLowerCase()))
  const idx = Object.fromEntries(HEADERS.map((h) => [h, head.indexOf(h)])) as Record<(typeof HEADERS)[number], number>
  const missingCols = (['admissionNo', 'firstName', 'lastName', 'gender', 'dateOfBirth', 'class'] as const).filter((h) => idx[h] < 0)
  if (missingCols.length) return NextResponse.json({ error: `Missing columns: ${missingCols.join(', ')}. Download the template for the exact headers.` }, { status: 400 })

  const [existing, classes, sub] = await Promise.all([
    prisma.student.findMany({ where: { schoolId }, select: { admissionNo: true } }),
    prisma.class.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    prisma.schoolSubscription.findUnique({ where: { schoolId }, select: { plan: true, maxStudents: true } }),
  ])
  const taken = new Set(existing.map((s) => s.admissionNo.toLowerCase()))
  const classByName = new Map(classes.map((c) => [c.name.toLowerCase(), c]))
  const seen = new Set<string>()
  const errors: { line: number; error: string }[] = []
  const ok: { line: number; admissionNo: string; firstName: string; lastName: string; gender: 'MALE' | 'FEMALE'; dob: Date; className: string; guardianName: string | null; guardianPhone: string | null; relationship: string | null }[] = []
  const cell = (r: string[], k: (typeof HEADERS)[number]) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '')
  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    const admissionNo = cell(r, 'admissionNo'), firstName = cell(r, 'firstName'), lastName = cell(r, 'lastName'), g = cell(r, 'gender').toUpperCase(), dobRaw = cell(r, 'dateOfBirth'), className = cell(r, 'class')
    if (!admissionNo || !firstName || !lastName || !className) return errors.push({ line, error: 'admissionNo, firstName, lastName and class are required' })
    if (taken.has(admissionNo.toLowerCase())) return errors.push({ line, error: `Admission number ${admissionNo} already exists` })
    if (seen.has(admissionNo.toLowerCase())) return errors.push({ line, error: `Admission number ${admissionNo} appears twice in the file` })
    const gender = g === 'M' || g === 'MALE' || g === 'ME' ? 'MALE' : g === 'F' || g === 'FEMALE' || g === 'KE' ? 'FEMALE' : null
    if (!gender) return errors.push({ line, error: `Gender must be M or F (got "${g}")` })
    const dob = parseDate(dobRaw)
    if (!dob) return errors.push({ line, error: `Date of birth "${dobRaw}" is not YYYY-MM-DD or DD/MM/YYYY` })
    const gPhoneRaw = cell(r, 'guardianPhone'), gName = cell(r, 'guardianName')
    const gPhone = gPhoneRaw ? normaliseTzPhone(gPhoneRaw) : null
    if (gPhoneRaw && !gPhone) return errors.push({ line, error: `Guardian phone "${gPhoneRaw}" is not a valid Tanzanian number` })
    if (gName && !gPhone) return errors.push({ line, error: 'A guardian needs a phone number' })
    seen.add(admissionNo.toLowerCase())
    ok.push({ line, admissionNo, firstName, lastName, gender, dob, className, guardianName: gName || null, guardianPhone: gPhone ? `+${gPhone}` : null, relationship: cell(r, 'relationship') || null })
  })

  // Plan limit: the FREE band is 50 pupils in total.
  const limit = sub?.maxStudents ?? PLAN_LIMITS.FREE.maxStudents
  const room = Math.max(0, limit - existing.length)
  let overLimit = 0
  if (ok.length > room && sub?.plan !== 'ENTERPRISE') { overLimit = ok.length - room; for (const r of ok.splice(room)) errors.push({ line: r.line, error: `Beyond the plan limit of ${limit} pupils — ask for a quote to enrol more` }) }
  const newClasses = [...new Set(ok.map((r) => r.className))].filter((n) => !classByName.has(n.toLowerCase()))

  if (dryRun) return NextResponse.json({ dryRun: true, importable: ok.length, errors, newClasses, overLimit })
  if (ok.length === 0) return NextResponse.json({ imported: 0, errors, newClasses: [], overLimit }, { status: errors.length ? 400 : 200 })
  const limitResp = await checkPlanLimit(schoolId, 'students')
  if (limitResp) return limitResp

  let guardiansCreated = 0, guardiansReused = 0
  await prisma.$transaction(async (tx) => {
    for (const name of newClasses) {
      const level = /^(std|standard|darasa)/i.test(name) ? 'PRIMARY' : /form\s*[56]|kidato\s*(cha\s*)?[56]/i.test(name) ? 'A_LEVEL' : /form|kidato/i.test(name) ? 'O_LEVEL' : /nursery|chekechea|baby|kg|pre/i.test(name) ? 'NURSERY' : 'PRIMARY'
      const c = await tx.class.create({ data: { name, level, schoolId } })
      classByName.set(name.toLowerCase(), c)
    }
    for (const r of ok) {
      const cls = classByName.get(r.className.toLowerCase())!
      const student = await tx.student.create({ data: { admissionNo: r.admissionNo, firstName: r.firstName, lastName: r.lastName, gender: r.gender, dateOfBirth: r.dob, classId: cls.id, schoolId } })
      if (r.guardianPhone) {
        // Same phone in this school = same parent; siblings share one record.
        let g = await tx.guardian.findFirst({ where: { phone: r.guardianPhone, students: { some: { student: { schoolId } } } } })
        if (g) guardiansReused++
        else {
          const [gf, ...gl] = (r.guardianName || 'Guardian').split(/\s+/)
          g = await tx.guardian.create({ data: { firstName: gf, lastName: gl.join(' ') || '—', phone: r.guardianPhone, relationship: r.relationship } })
          guardiansCreated++
        }
        await tx.studentGuardian.create({ data: { studentId: student.id, guardianId: g.id, isPrimary: true } })
      }
    }
  }, { timeout: 120_000 })
  await record(session, { action: 'create', entity: 'Student', entityId: null, summary: `Imported ${ok.length} pupil(s) from CSV (${newClasses.length} new class(es), ${guardiansCreated} guardians created, ${guardiansReused} reused, ${errors.length} row(s) skipped)` })
  return NextResponse.json({ imported: ok.length, errors, newClasses, guardiansCreated, guardiansReused, overLimit })
}
