import { prisma } from '@/lib/db'
import { SCHOOL_HEADER_SELECT, type SchoolHeader } from '@/lib/pdf'
import { gradeFor, loadReportConfig, type ReportConfig } from './settings'

/**
 * The academic results engine: turns raw exam marks for one class in one term
 * into what a school actually reports — a weighted mark and grade per subject,
 * totals, averages, points, positions, and (for O-level) the NECTA division.
 *
 * Everything here is pure computation over data already in the database; the
 * PDF renderers and the JSON API both consume the same `ClassResults`.
 */

export interface SubjectMark {
  subjectId: string
  subject: string
  /** Weighted percentage across the term's assessments, 0–100. */
  pct: number | null
  grade: string | null
  points: number | null
  remark: string | null
  /** Position in the class for this subject (1 = best), dense ranking. */
  position: number | null
  /** Which assessments contributed, e.g. "CAT 40% · End of term 60%". */
  basis: string
}

export interface PupilResult {
  studentId: string
  name: string
  admissionNo: string
  gender: string
  subjects: SubjectMark[]
  /** Subjects with a mark. */
  taken: number
  total: number
  average: number | null
  /** Sum of points on the best N subjects (O-level), else null. */
  points: number | null
  division: string | null
  /** Class position, dense (ties share a position). */
  position: number | null
  attendance: { present: number; total: number; rate: number | null }
  remarks: { classTeacher: string | null; headTeacher: string | null; conduct: string | null }
}

export interface SubjectStat {
  subjectId: string
  subject: string
  taken: number
  mean: number | null
  highest: number | null
  lowest: number | null
  /** Grade → count. */
  distribution: Record<string, number>
}

export interface ClassResults {
  school: { id: string } & SchoolHeader
  class: { id: string; name: string; level: string }
  term: { id: string; name: string; academicYear: string }
  config: ReportConfig
  pupils: PupilResult[]
  subjects: SubjectStat[]
  classAverage: number | null
  /** Division → count, when divisions apply. */
  divisions: Record<string, number> | null
  gradeTotals: Record<string, number>
  /** Exams in the term still DRAFT/SUBMITTED that were included (0 when publishedOnly). */
  unpublished: number
}

const EXAM_TYPE_LABEL: Record<string, string> = {
  CAT: 'CAT', MIDTERM: 'Mid-term', END_OF_TERM: 'End of term', MOCK: 'Mock', NECTA_MOCK: 'NECTA mock', NECTA: 'NECTA',
}

/** Dense ranking: equal values share a position; the next distinct value takes position+1. */
export function denseRank<T>(items: T[], value: (t: T) => number | null): Map<T, number | null> {
  const ranked = items.filter((i) => value(i) !== null).sort((a, b) => (value(b) as number) - (value(a) as number))
  const out = new Map<T, number | null>()
  let pos = 0, prev: number | null = null
  for (const item of ranked) {
    const v = value(item) as number
    if (prev === null || v < prev) pos += 1
    out.set(item, pos)
    prev = v
  }
  for (const i of items) if (!out.has(i)) out.set(i, null)
  return out
}

/** CSEE-style division from a points total over the best N subjects. */
export function divisionFor(points: number | null, config: ReportConfig): string | null {
  if (points === null || !config.division.enabled) return null
  for (const band of config.division.bands) if (points <= band.maxPoints) return band.name
  return '0'
}

export async function computeClassResults(schoolId: string, classId: string, termId: string, opts: { publishedOnly?: boolean } = {}): Promise<ClassResults | null> {
  const [config, school, cls, term] = await Promise.all([
    loadReportConfig(schoolId),
    prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, ...SCHOOL_HEADER_SELECT } }),
    prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true, name: true, level: true } }),
    prisma.term.findFirst({ where: { id: termId, academicYear: { schoolId } }, include: { academicYear: { select: { name: true, startDate: true, endDate: true } } } }),
  ])
  if (!school || !cls || !term) return null

  const [students, exams] = await Promise.all([
    prisma.student.findMany({
      where: { classId, schoolId, status: 'ACTIVE' },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true, firstName: true, lastName: true, admissionNo: true, gender: true,
        attendances: { where: { date: { gte: term.startDate, lte: term.endDate } }, select: { status: true } },
        reportRemarks: { where: { termId }, select: { classTeacherRemark: true, headTeacherRemark: true, conduct: true } },
      },
    }),
    prisma.exam.findMany({
      // Parents and pupils only ever see published mark sheets; staff previews may include the rest.
      where: { classId, termId, ...(opts.publishedOnly ? { status: 'PUBLISHED' } : {}) },
      include: { subject: { select: { id: true, name: true } }, results: { select: { studentId: true, marks: true } } },
    }),
  ])

  // Subjects in the term, in a stable order.
  const subjectMap = new Map<string, string>()
  for (const e of exams) subjectMap.set(e.subject.id, e.subject.name)
  const subjectIds = [...subjectMap.keys()].sort((a, b) => subjectMap.get(a)!.localeCompare(subjectMap.get(b)!))

  // Weighted subject mark per pupil: for each subject, gather this pupil's
  // percentage per exam type, then combine by the configured weights,
  // re-normalised over the types that actually exist for that subject.
  function subjectMark(studentId: string, subjectId: string): { pct: number | null; basis: string } {
    const byType: Record<string, number[]> = {}
    for (const e of exams) {
      if (e.subjectId !== subjectId) continue
      const r = e.results.find((x) => x.studentId === studentId)
      if (!r) continue
      const pct = e.totalMarks > 0 ? (r.marks / e.totalMarks) * 100 : 0
      ;(byType[e.type] ??= []).push(Math.max(0, Math.min(100, pct)))
    }
    const types = Object.keys(byType)
    if (types.length === 0) return { pct: null, basis: '' }
    // Same-type exams average together first (two CATs = one CAT mark).
    const typeAvg: Record<string, number> = {}
    for (const t of types) typeAvg[t] = byType[t].reduce((a, b) => a + b, 0) / byType[t].length
    const weights = config.weights as Record<string, number>
    let weightSum = types.reduce((s, t) => s + (weights[t] ?? 0), 0)
    // If every present type is weighted 0, fall back to an equal split.
    const effective: Record<string, number> = {}
    if (weightSum <= 0) { for (const t of types) effective[t] = 1; weightSum = types.length }
    else for (const t of types) effective[t] = weights[t] ?? 0
    const pct = types.reduce((s, t) => s + typeAvg[t] * (effective[t] / weightSum), 0)
    const basis = types.map((t) => `${EXAM_TYPE_LABEL[t] ?? t} ${Math.round((effective[t] / weightSum) * 100)}%`).join(' · ')
    return { pct: Math.round(pct * 10) / 10, basis }
  }

  const pupils: PupilResult[] = students.map((s) => {
    const subjects: SubjectMark[] = subjectIds.map((sid) => {
      const { pct, basis } = subjectMark(s.id, sid)
      const band = pct === null ? null : gradeFor(pct, config.scale)
      return {
        subjectId: sid, subject: subjectMap.get(sid)!, pct,
        grade: band?.grade ?? null, points: band?.points ?? null, remark: band?.remark ?? null,
        position: null, basis,
      }
    })
    const taken = subjects.filter((x) => x.pct !== null)
    const total = Math.round(taken.reduce((a, x) => a + (x.pct as number), 0) * 10) / 10
    const average = taken.length ? Math.round((total / taken.length) * 10) / 10 : null

    let points: number | null = null
    if (config.division.enabled && cls.level === 'O_LEVEL' && taken.length > 0) {
      const best = taken.map((x) => x.points as number).sort((a, b) => a - b).slice(0, config.division.bestOf)
      // Fewer subjects than bestOf: NECTA treats missing as the worst grade.
      const worst = Math.max(...config.scale.map((b) => b.points))
      while (best.length < config.division.bestOf) best.push(worst)
      points = best.reduce((a, b) => a + b, 0)
    }

    const present = s.attendances.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length
    const r = s.reportRemarks[0]
    return {
      studentId: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo, gender: s.gender,
      subjects, taken: taken.length, total, average, points, division: divisionFor(points, config), position: null,
      attendance: { present, total: s.attendances.length, rate: s.attendances.length ? Math.round((present / s.attendances.length) * 100) : null },
      remarks: { classTeacher: r?.classTeacherRemark ?? null, headTeacher: r?.headTeacherRemark ?? null, conduct: r?.conduct ?? null },
    }
  })

  // Positions.
  if (config.ranking.enabled) {
    const overall = denseRank(pupils, (p) => (config.ranking.by === 'total' ? (p.taken ? p.total : null) : p.average))
    for (const p of pupils) p.position = overall.get(p) ?? null
    for (const sid of subjectIds) {
      const marks = pupils.map((p) => p.subjects.find((x) => x.subjectId === sid)!)
      const rank = denseRank(marks, (m) => m.pct)
      for (const m of marks) m.position = rank.get(m) ?? null
    }
  }

  // Subject statistics and class-wide totals.
  const subjects: SubjectStat[] = subjectIds.map((sid) => {
    const marks = pupils.map((p) => p.subjects.find((x) => x.subjectId === sid)!).filter((m) => m.pct !== null)
    const pcts = marks.map((m) => m.pct as number)
    const distribution: Record<string, number> = {}
    for (const b of config.scale) distribution[b.grade] = 0
    for (const m of marks) distribution[m.grade as string] = (distribution[m.grade as string] ?? 0) + 1
    return {
      subjectId: sid, subject: subjectMap.get(sid)!, taken: marks.length,
      mean: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null,
      highest: pcts.length ? Math.max(...pcts) : null,
      lowest: pcts.length ? Math.min(...pcts) : null,
      distribution,
    }
  })

  const averages = pupils.map((p) => p.average).filter((a): a is number => a !== null)
  const gradeTotals: Record<string, number> = {}
  for (const b of config.scale) gradeTotals[b.grade] = 0
  for (const p of pupils) for (const m of p.subjects) if (m.grade) gradeTotals[m.grade] = (gradeTotals[m.grade] ?? 0) + 1

  let divisions: Record<string, number> | null = null
  if (config.division.enabled && cls.level === 'O_LEVEL') {
    divisions = {}
    for (const b of config.division.bands) divisions[b.name] = 0
    divisions['0'] = 0
    for (const p of pupils) if (p.division) divisions[p.division] = (divisions[p.division] ?? 0) + 1
  }

  return {
    school, class: cls,
    term: { id: term.id, name: term.name, academicYear: term.academicYear.name },
    config, pupils, subjects,
    classAverage: averages.length ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 10) / 10 : null,
    divisions, gradeTotals,
    unpublished: exams.filter((e) => e.status !== 'PUBLISHED').length,
  }
}
