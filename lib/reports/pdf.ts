import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib"
import {
  startDoc, header, detailRows, table, footer, text, textRight, gap, rule, ensureRoom,
  safe, ACCENT, SOFT, INK, RULE, MARGIN, A4, type Doc,
} from '@/lib/pdf'
import type { ClassResults, PupilResult } from './academic'

/**
 * Academic report documents. All four read the same `ClassResults`, so the
 * numbers on a pupil's card, the class sheet and the summary can never
 * disagree.
 */

const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}`)
const printedOn = () =>
  new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: process.env.SCHOOL_TIMEZONE || 'Africa/Dar_es_Salaam' })

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

// ─── Report card (one pupil per page) ───────────────────────────────────────

function drawReportCard(doc: Doc, r: ClassResults, p: PupilResult) {
  const { config } = r
  const card = config.card
  header(doc, r.school, `Report card · ${r.term.name}, ${r.term.academicYear}`)

  const rows: [string, string][] = [
    ['NAME', p.name],
    ['ADMISSION NO', p.admissionNo],
    ['CLASS', r.class.name],
    ['TERM', `${r.term.name} · ${r.term.academicYear}`],
  ]
  if (card.showPosition && config.ranking.enabled) {
    rows.push(['POSITION', p.position ? `${ordinal(p.position)} of ${r.pupils.length}` : '—'])
  }
  if (card.showAttendance) {
    rows.push(['ATTENDANCE', p.attendance.rate === null ? 'Not recorded' : `${p.attendance.rate}%  (${p.attendance.present} of ${p.attendance.total} days)`])
  }
  detailRows(doc, rows)
  gap(doc, 6)

  const cols = [
    { title: 'SUBJECT', width: 150 },
    { title: 'MARK %', width: 62, align: 'right' as const },
    { title: 'GRADE', width: 52, align: 'right' as const },
    ...(card.showPoints ? [{ title: 'POINTS', width: 52, align: 'right' as const }] : []),
    ...(card.showSubjectPosition && config.ranking.enabled ? [{ title: 'POS', width: 44, align: 'right' as const }] : []),
    { title: '', width: 14 },
    { title: 'REMARK', width: 499 - 150 - 62 - 52 - 14 - (card.showPoints ? 52 : 0) - (card.showSubjectPosition && config.ranking.enabled ? 44 : 0) },
  ]
  table(
    doc, cols,
    p.subjects.map((s) => [
      s.subject,
      pct(s.pct),
      s.grade ?? '—',
      ...(card.showPoints ? [s.points === null ? '—' : String(s.points)] : []),
      ...(card.showSubjectPosition && config.ranking.enabled ? [s.position ? String(s.position) : '—'] : []),
      '',
      s.pct === null ? 'Not assessed' : (s.remark ?? ''),
    ]),
    { emptyMessage: 'No assessments recorded for this term.' }
  )

  ensureRoom(doc, 120)
  const right = A4[0] - MARGIN
  text(doc, 'SUMMARY', { size: 8, bold: true, color: SOFT }); gap(doc, 16)
  const line = (label: string, value: string, strong = false) => {
    text(doc, label, { size: 9.5 })
    textRight(doc, value, right, { size: strong ? 10.5 : 9.5, bold: true, color: strong ? ACCENT : INK })
    gap(doc, 15)
  }
  line('Subjects assessed', `${p.taken} of ${p.subjects.length}`)
  line('Total', p.taken ? p.total.toFixed(1) : '—')
  line('Average', p.average === null ? '—' : `${p.average.toFixed(1)}%`, true)
  if (p.average !== null) line('Overall grade', gradeLabel(p.average, config))
  if (card.showClassAverage) line('Class average', r.classAverage === null ? '—' : `${r.classAverage.toFixed(1)}%`)
  if (p.points !== null) {
    line(`Points (best ${config.division.bestOf})`, String(p.points))
    line('Division', p.division ?? '—', true)
  }
  gap(doc, 6); rule(doc); gap(doc, 16)

  if (card.showRemarks) {
    ensureRoom(doc, 90)
    const ct = p.remarks.classTeacher ?? (card.autoRemarks && p.average !== null ? autoRemark(p.average, config) : null)
    text(doc, 'CLASS TEACHER', { size: 8, bold: true, color: SOFT }); gap(doc, 13)
    wrapText(doc, ct ?? '—', 9.5); gap(doc, 10)
    text(doc, 'HEAD TEACHER', { size: 8, bold: true, color: SOFT }); gap(doc, 13)
    wrapText(doc, p.remarks.headTeacher ?? '—', 9.5); gap(doc, 10)
    if (card.showConduct) {
      text(doc, 'CONDUCT', { size: 8, bold: true, color: SOFT }); gap(doc, 13)
      wrapText(doc, p.remarks.conduct ?? '—', 9.5); gap(doc, 10)
    }
  }

  if (card.showSignatures) {
    ensureRoom(doc, 70)
    gap(doc, 14)
    text(doc, 'Class teacher', { size: 8, color: SOFT })
    text(doc, 'Head teacher', { x: 240, size: 8, color: SOFT })
    text(doc, 'Parent / guardian', { x: 420, size: 8, color: SOFT })
    gap(doc, 26)
    for (const [x1, x2] of [[MARGIN, 210], [240, 400], [420, A4[0] - MARGIN]] as const) {
      doc.page.drawLine({ start: { x: x1, y: doc.y }, end: { x: x2, y: doc.y }, thickness: 0.75, color: SOFT })
    }
    gap(doc, 10)
  }
  if (card.footerNote) { gap(doc, 8); text(doc, card.footerNote, { size: 8.5, color: SOFT }) }
}

function gradeLabel(avg: number, config: ClassResults['config']) {
  const band = config.scale.find((b) => avg >= b.min) ?? config.scale[config.scale.length - 1]
  return `${band.grade} — ${band.remark}`
}

function autoRemark(avg: number, config: ClassResults['config']) {
  const band = config.scale.find((b) => avg >= b.min) ?? config.scale[config.scale.length - 1]
  const map: Record<string, string> = {
    A: 'Excellent work this term. Keep up the outstanding effort.',
    B: 'Very good performance. With consistent effort an A is within reach.',
    C: 'Good, steady work. More practice in the weaker subjects will lift the average.',
    D: 'Satisfactory, but well below potential. Extra support is recommended.',
    F: 'Performance is a serious concern. Please meet the class teacher to agree a plan.',
  }
  return map[band.grade] ?? `${band.remark}.`
}

/** Simple word wrap for remarks, within the printable width. */
function wrapText(doc: Doc, value: string, size: number) {
  const max = A4[0] - MARGIN * 2
  const words = safe(value).split(/\s+/)
  let line = ''
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w
    if (doc.regular.widthOfTextAtSize(trial, size) > max) {
      ensureRoom(doc, 14); text(doc, line, { size }); gap(doc, 13); line = w
    } else line = trial
  }
  if (line) { ensureRoom(doc, 14); text(doc, line, { size }); gap(doc, 13) }
}

export async function renderReportCards(r: ClassResults, only?: string): Promise<Uint8Array> {
  const pupils = only ? r.pupils.filter((p) => p.studentId === only) : r.pupils
  const doc = await startDoc(`Report cards · ${r.class.name} · ${r.term.name}`, r.school)
  pupils.forEach((p, i) => {
    if (i > 0) { doc.page = doc.pdf.addPage(A4); doc.y = A4[1] - MARGIN }
    drawReportCard(doc, r, p)
  })
  footer(doc, `${r.school.name} · ${r.class.name} · ${r.term.name} ${r.term.academicYear} · Printed ${printedOn()}`)
  return doc.pdf.save()
}

// ─── Class results sheet (landscape) ─────────────────────────────────────────

const LANDSCAPE: [number, number] = [A4[1], A4[0]]

export async function renderClassSheet(r: ClassResults): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Results sheet · ${r.class.name} · ${r.term.name}`)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const subjects = r.subjects
  const showDiv = r.divisions !== null
  const showPos = r.config.ranking.enabled

  // Column plan: # | name | admission | subjects… | total | avg | grade | [pts] | [div] | [pos]
  const fixedRight = 44 + 40 + 40 + (showDiv ? 36 + 36 : 0) + (showPos ? 34 : 0)
  const nameW = 130, admW = 70, idxW = 22
  const usable = LANDSCAPE[0] - MARGIN * 2 - idxW - nameW - admW - fixedRight
  const subW = subjects.length ? Math.max(30, Math.floor(usable / subjects.length)) : 0
  const perPage = 26

  const pages: PupilResult[][] = []
  for (let i = 0; i < r.pupils.length; i += perPage) pages.push(r.pupils.slice(i, i + perPage))
  if (pages.length === 0) pages.push([])

  pages.forEach((chunk, pi) => {
    const page = pdf.addPage(LANDSCAPE)
    let y = LANDSCAPE[1] - MARGIN
    const draw = (t: string, x: number, size = 8, font: PDFFont = regular, color = INK) =>
      page.drawText(safe(t), { x, y, size, font, color })
    const drawRight = (t: string, right: number, size = 8, font: PDFFont = regular, color = INK) =>
      page.drawText(safe(t), { x: right - font.widthOfTextAtSize(safe(t), size), y, size, font, color })

    draw(r.school.name.toUpperCase(), MARGIN, 13, bold)
    drawRight(`Page ${pi + 1} of ${pages.length}`, LANDSCAPE[0] - MARGIN, 8, regular, SOFT)
    y -= 16
    draw(`CLASS RESULTS SHEET · ${r.class.name} · ${r.term.name} ${r.term.academicYear}`, MARGIN, 9, bold, ACCENT)
    y -= 22

    // header row
    let x = MARGIN
    draw('#', x, 7, bold, SOFT); x += idxW
    draw('PUPIL', x, 7, bold, SOFT); x += nameW
    draw('ADM NO', x, 7, bold, SOFT); x += admW
    for (const s of subjects) { drawRight(abbrev(s.subject), x + subW - 2, 7, bold, SOFT); x += subW }
    drawRight('TOTAL', x + 44 - 2, 7, bold, SOFT); x += 44
    drawRight('AVG', x + 40 - 2, 7, bold, SOFT); x += 40
    drawRight('GRD', x + 40 - 2, 7, bold, SOFT); x += 40
    if (showDiv) { drawRight('PTS', x + 36 - 2, 7, bold, SOFT); x += 36; drawRight('DIV', x + 36 - 2, 7, bold, SOFT); x += 36 }
    if (showPos) { drawRight('POS', x + 34 - 2, 7, bold, SOFT); x += 34 }
    y -= 6
    page.drawLine({ start: { x: MARGIN, y }, end: { x: LANDSCAPE[0] - MARGIN, y }, thickness: 0.75, color: RULE })
    y -= 12

    chunk.forEach((p, i) => {
      const n = pi * perPage + i + 1
      let cx = MARGIN
      draw(String(n), cx, 8); cx += idxW
      draw(p.name, cx, 8); cx += nameW
      draw(p.admissionNo, cx, 7.5, regular, SOFT); cx += admW
      for (const s of subjects) {
        const m = p.subjects.find((z) => z.subjectId === s.subjectId)
        drawRight(m?.pct === null || m?.pct === undefined ? '—' : `${Math.round(m.pct)}${m.grade}`, cx + subW - 2, 8)
        cx += subW
      }
      drawRight(p.taken ? p.total.toFixed(0) : '—', cx + 44 - 2, 8); cx += 44
      drawRight(p.average === null ? '—' : p.average.toFixed(1), cx + 40 - 2, 8, bold); cx += 40
      drawRight(p.average === null ? '—' : gradeLabel(p.average, r.config).split(' ')[0], cx + 40 - 2, 8); cx += 40
      if (showDiv) {
        drawRight(p.points === null ? '—' : String(p.points), cx + 36 - 2, 8); cx += 36
        drawRight(p.division ?? '—', cx + 36 - 2, 8, bold); cx += 36
      }
      if (showPos) { drawRight(p.position ? String(p.position) : '—', cx + 34 - 2, 8, bold, ACCENT); cx += 34 }
      y -= 14
    })

    if (pi === pages.length - 1) {
      y -= 4
      page.drawLine({ start: { x: MARGIN, y }, end: { x: LANDSCAPE[0] - MARGIN, y }, thickness: 0.75, color: RULE })
      y -= 14
      let cx = MARGIN + idxW
      draw('Subject mean', cx, 8, bold, SOFT); cx += nameW + admW
      for (const s of subjects) { drawRight(s.mean === null ? '—' : s.mean.toFixed(1), cx + subW - 2, 8, bold); cx += subW }
      cx += 44
      drawRight(r.classAverage === null ? '—' : r.classAverage.toFixed(1), cx + 40 - 2, 8, bold, ACCENT)
      y -= 18
      const legend = subjects.map((s) => `${abbrev(s.subject)} = ${s.subject}`).join('   ')
      draw(legend, MARGIN, 7, regular, SOFT)
      y -= 11
      draw(`Cells show mark% and grade. Marks combine ${weightsLabel(r)}.`, MARGIN, 7, regular, SOFT)
    }
    page.drawText(safe(`${r.school.name} · Printed ${printedOn()}`), { x: MARGIN, y: 24, size: 7, font: regular, color: SOFT })
  })
  return pdf.save()
}

function abbrev(subject: string) {
  const words = subject.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean)
  if (words.length >= 2) return words.map((w) => w[0]).join('').toUpperCase().slice(0, 4)
  return subject.slice(0, 4).toUpperCase()
}

function weightsLabel(r: ClassResults) {
  const w = r.config.weights
  const parts = Object.entries(w).filter(([, v]) => v > 0).map(([k, v]) => `${k.replace(/_/g, ' ').toLowerCase()} ${v}%`)
  return parts.length ? parts.join(', ') : 'all assessments equally'
}

// ─── Subject analysis ───────────────────────────────────────────────────────

export async function renderSubjectAnalysis(r: ClassResults): Promise<Uint8Array> {
  const doc = await startDoc(`Subject analysis · ${r.class.name} · ${r.term.name}`, r.school)
  header(doc, r.school, `Subject analysis · ${r.class.name} · ${r.term.name} ${r.term.academicYear}`)
  const grades = r.config.scale.map((b) => b.grade)
  const gradeCols = grades.map((g) => ({ title: g, width: 30, align: 'right' as const }))
  const fixed = 499 - gradeCols.length * 30
  table(
    doc,
    [
      { title: 'SUBJECT', width: Math.max(120, fixed - 150) },
      { title: 'SAT', width: 40, align: 'right' },
      { title: 'MEAN', width: 50, align: 'right' },
      { title: 'HIGH', width: 30, align: 'right' },
      { title: 'LOW', width: 30, align: 'right' },
      ...gradeCols,
    ],
    r.subjects.map((s) => [
      s.subject, String(s.taken), s.mean === null ? '—' : s.mean.toFixed(1),
      s.highest === null ? '—' : String(Math.round(s.highest)), s.lowest === null ? '—' : String(Math.round(s.lowest)),
      ...grades.map((g) => String(s.distribution[g] ?? 0)),
    ]),
    { emptyMessage: 'No assessments recorded for this term.' }
  )
  ensureRoom(doc, 60)
  text(doc, 'READING THIS', { size: 8, bold: true, color: SOFT }); gap(doc, 13)
  wrapText(doc, `Mean is the average subject mark across pupils who sat it. Grade columns count pupils per band using the school's scale (${r.config.scale.map((b) => `${b.grade} ≥ ${b.min}`).join(', ')}). Marks combine ${weightsLabel(r)}.`, 8.5)
  footer(doc, `${r.school.name} · ${r.class.name} · Printed ${printedOn()}`)
  return doc.pdf.save()
}

// ─── Performance summary ────────────────────────────────────────────────────

export async function renderPerformanceSummary(r: ClassResults): Promise<Uint8Array> {
  const doc = await startDoc(`Performance summary · ${r.class.name} · ${r.term.name}`, r.school)
  header(doc, r.school, `Performance summary · ${r.class.name} · ${r.term.name} ${r.term.academicYear}`)

  const right = A4[0] - MARGIN
  const line = (label: string, value: string, strong = false) => {
    text(doc, label, { size: 9.5 }); textRight(doc, value, right, { size: strong ? 11 : 9.5, bold: true, color: strong ? ACCENT : INK }); gap(doc, 15)
  }
  text(doc, 'CLASS', { size: 8, bold: true, color: SOFT }); gap(doc, 16)
  line('Pupils on roll', String(r.pupils.length))
  line('Pupils with results', String(r.pupils.filter((p) => p.taken > 0).length))
  line('Subjects assessed', String(r.subjects.length))
  line('Class average', r.classAverage === null ? '—' : `${r.classAverage.toFixed(1)}%`, true)
  const withAvg = r.pupils.filter((p) => p.average !== null)
  if (withAvg.length) {
    const best = withAvg.reduce((a, b) => ((b.average as number) > (a.average as number) ? b : a))
    line('Highest average', `${(best.average as number).toFixed(1)}% — ${best.name}`)
    const low = withAvg.reduce((a, b) => ((b.average as number) < (a.average as number) ? b : a))
    line('Lowest average', `${(low.average as number).toFixed(1)}%`)
  }
  gap(doc, 6); rule(doc); gap(doc, 16)

  text(doc, 'GRADE DISTRIBUTION (ALL SUBJECT MARKS)', { size: 8, bold: true, color: SOFT }); gap(doc, 16)
  const totalGrades = Object.values(r.gradeTotals).reduce((a, b) => a + b, 0)
  table(doc,
    [{ title: 'GRADE', width: 80 }, { title: 'BAND', width: 200 }, { title: 'COUNT', width: 80, align: 'right' }, { title: 'SHARE', width: 139, align: 'right' }],
    r.config.scale.map((b) => [
      b.grade, `${b.min}% and above · ${b.remark}`, String(r.gradeTotals[b.grade] ?? 0),
      totalGrades ? `${Math.round(((r.gradeTotals[b.grade] ?? 0) / totalGrades) * 100)}%` : '—',
    ]))

  if (r.divisions) {
    ensureRoom(doc, 120)
    text(doc, `DIVISIONS (BEST ${r.config.division.bestOf} SUBJECTS)`, { size: 8, bold: true, color: SOFT }); gap(doc, 16)
    const entries = [...r.config.division.bands.map((b) => b.name), '0']
    table(doc,
      [{ title: 'DIVISION', width: 120 }, { title: 'POINTS', width: 160 }, { title: 'PUPILS', width: 80, align: 'right' }, { title: 'SHARE', width: 139, align: 'right' }],
      entries.map((name, i) => {
        const band = r.config.division.bands.find((b) => b.name === name)
        const prev = i > 0 ? r.config.division.bands[i - 1]?.maxPoints : null
        const range = band ? `${prev !== null && prev !== undefined ? prev + 1 : r.config.division.bestOf}–${band.maxPoints}` : `above ${r.config.division.bands[r.config.division.bands.length - 1].maxPoints}`
        const n = r.divisions![name] ?? 0
        return [name === '0' ? 'Division 0' : `Division ${name}`, range, String(n), r.pupils.length ? `${Math.round((n / r.pupils.length) * 100)}%` : '—']
      }))
  }

  ensureRoom(doc, 140)
  text(doc, 'TOP OF THE CLASS', { size: 8, bold: true, color: SOFT }); gap(doc, 16)
  const top = [...withAvg].sort((a, b) => (b.average as number) - (a.average as number)).slice(0, 10)
  table(doc,
    [{ title: 'POS', width: 50, align: 'right' }, { title: 'PUPIL', width: 220 }, { title: 'ADM NO', width: 100 }, { title: 'AVERAGE', width: 129, align: 'right' }],
    top.map((p) => [p.position ? String(p.position) : '—', p.name, p.admissionNo, `${(p.average as number).toFixed(1)}%`]),
    { emptyMessage: 'No results yet.' })

  footer(doc, `${r.school.name} · ${r.class.name} · Printed ${printedOn()}`)
  return doc.pdf.save()
}
