import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { addressLine } from '@/lib/letterhead'

/**
 * Printable documents a school hands to a parent: end-of-term report cards and
 * fee statements. Exports were CSV only, which is fine for a spreadsheet and
 * useless for something a pupil carries home.
 *
 * pdf-lib is pure JavaScript, so this runs in a route handler with no native
 * dependency and no headless browser.
 */

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 48

// Muted ink and a single accent, so a page still reads on a cheap mono printer.
const INK = rgb(0.07, 0.1, 0.13)
const SOFT = rgb(0.42, 0.48, 0.53)
const RULE = rgb(0.83, 0.87, 0.9)
const ACCENT = rgb(0.04, 0.44, 0.58)

export interface SchoolHeader {
  name: string
  motto?: string | null
  address?: string | null
  poBox?: string | null
  city?: string | null
  district?: string | null
  region?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  registrationNo?: string | null
  logoUrl?: string | null
}

/** The School columns every printed document's letterhead needs. */
export const SCHOOL_HEADER_SELECT = { name: true, motto: true, address: true, poBox: true, city: true, district: true, region: true, phone: true, email: true, website: true, registrationNo: true, logoUrl: true } as const

export { addressLine } from '@/lib/letterhead'

/** Whole shillings — the currency has no practical subunit. */
export function tzs(amount: number) {
  return `TZS ${Math.round(amount).toLocaleString('en-GB')}`
}

/** Strips anything WinAnsi cannot encode, so a stray character can't 500 a download. */
export function safe(text: string) {
  return String(text ?? '').replace(/[^\x20-\x7E]/g, ' ')
}

export interface Doc {
  pdf: PDFDocument
  page: PDFPage
  regular: PDFFont
  bold: PDFFont
  y: number
  /** School logo, embedded once per document when the profile has one. */
  logo?: PDFImage | null
}

/**
 * Pass the school so its logo (a data URL set in Settings → School profile)
 * is embedded once and drawn by every header() on the document.
 */
export async function startDoc(title: string, school?: Pick<SchoolHeader, 'logoUrl'> | null): Promise<Doc> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  pdf.setCreator('Shule SMS')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage(A4)
  return { pdf, page, regular, bold, y: A4[1] - MARGIN, logo: await embedLogo(pdf, school?.logoUrl) }
}

async function embedLogo(pdf: PDFDocument, url: string | null | undefined): Promise<PDFImage | null> {
  const m = url?.match(/^data:image\/(png|jpe?g);base64,(.+)$/i)
  if (!m) return null
  try {
    // Uint8Array.from: pdf-lib reads offsets from the ArrayBuffer, which a pooled Node Buffer breaks.
    const bytes = Uint8Array.from(Buffer.from(m[2], 'base64'))
    return m[1].toLowerCase() === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
  } catch { return null }
}

/** Starts a fresh page when the next block would run off the bottom. */
export function ensureRoom(doc: Doc, needed: number) {
  if (doc.y - needed > MARGIN) return
  doc.page = doc.pdf.addPage(A4)
  doc.y = A4[1] - MARGIN
}

export function text(
  doc: Doc,
  value: string,
  opts: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; y?: number } = {}
) {
  const size = opts.size ?? 10
  doc.page.drawText(safe(value), {
    x: opts.x ?? MARGIN,
    y: opts.y ?? doc.y,
    size,
    font: opts.bold ? doc.bold : doc.regular,
    color: opts.color ?? INK,
  })
}

/** Right-aligns against a column edge — needed for money columns. */
export function textRight(doc: Doc, value: string, right: number, opts: { size?: number; bold?: boolean; color?: any } = {}) {
  const size = opts.size ?? 10
  const font = opts.bold ? doc.bold : doc.regular
  const width = font.widthOfTextAtSize(safe(value), size)
  text(doc, value, { ...opts, x: right - width, size })
}

export function rule(doc: Doc, color = RULE) {
  doc.page.drawLine({
    start: { x: MARGIN, y: doc.y },
    end: { x: A4[0] - MARGIN, y: doc.y },
    thickness: 0.75,
    color,
  })
}

export function gap(doc: Doc, amount: number) {
  doc.y -= amount
}

export function header(doc: Doc, school: SchoolHeader, documentTitle: string) {
  // Logo on the left, letterhead text beside it; without a logo the text sits at the margin.
  const top = doc.y
  const LOGO = 44
  let x = MARGIN
  if (doc.logo) {
    const s = Math.min(LOGO / doc.logo.width, LOGO / doc.logo.height)
    doc.page.drawImage(doc.logo, { x: MARGIN, y: top - LOGO + 4, width: doc.logo.width * s, height: doc.logo.height * s })
    x = MARGIN + LOGO + 12
  }
  text(doc, school.name.toUpperCase(), { size: 16, bold: true, x })
  gap(doc, 15)
  const address = addressLine(school)
  if (address) { text(doc, address, { size: 8.5, color: SOFT, x }); gap(doc, 11) }
  const contact = [school.phone, school.email, school.website?.replace(/^https?:\/\//i, '').replace(/\/$/, ''), school.registrationNo ? `Reg. No. ${school.registrationNo}` : null].filter(Boolean).join('  ·  ')
  if (contact) { text(doc, contact, { size: 8.5, color: SOFT, x }); gap(doc, 11) }
  if (school.motto) { text(doc, `"${school.motto}"`, { size: 8.5, color: SOFT, x }); gap(doc, 13) }
  if (doc.logo && top - doc.y < LOGO + 6) doc.y = top - LOGO - 6
  gap(doc, 4)
  rule(doc, ACCENT)
  gap(doc, 18)
  text(doc, documentTitle.toUpperCase(), { size: 11, bold: true, color: ACCENT })
  gap(doc, 20)
}

/** Two-column label/value block for the pupil's particulars. */
export function detailRows(doc: Doc, rows: [string, string][]) {
  const colWidth = (A4[0] - MARGIN * 2) / 2
  for (let i = 0; i < rows.length; i += 2) {
    const pair = rows.slice(i, i + 2)
    pair.forEach(([label, value], col) => {
      const x = MARGIN + col * colWidth
      text(doc, label, { x, size: 8, color: SOFT })
      text(doc, value, { x: x + 78, size: 10, bold: true })
    })
    gap(doc, 16)
  }
}

export interface Column {
  title: string
  width: number
  align?: 'left' | 'right'
}

export function table(doc: Doc, columns: Column[], rows: string[][], opts: { emptyMessage?: string } = {}) {
  const startX = MARGIN
  const edges: number[] = []
  let x = startX
  for (const c of columns) { edges.push(x); x += c.width }
  const tableRight = x

  ensureRoom(doc, 40)
  columns.forEach((c, i) => {
    if (c.align === 'right') textRight(doc, c.title, edges[i] + c.width, { size: 8, bold: true, color: SOFT })
    else text(doc, c.title, { x: edges[i], size: 8, bold: true, color: SOFT })
  })
  gap(doc, 6)
  rule(doc)
  gap(doc, 14)

  if (rows.length === 0) {
    text(doc, opts.emptyMessage ?? 'Nothing recorded.', { size: 9.5, color: SOFT })
    gap(doc, 16)
    return tableRight
  }

  for (const row of rows) {
    ensureRoom(doc, 24)
    row.forEach((cell, i) => {
      const c = columns[i]
      if (!c) return
      if (c.align === 'right') textRight(doc, cell, edges[i] + c.width, { size: 9.5 })
      else text(doc, cell, { x: edges[i], size: 9.5 })
    })
    gap(doc, 15)
  }
  rule(doc)
  gap(doc, 14)
  return tableRight
}

export function footer(doc: Doc, note: string) {
  const pages = doc.pdf.getPages()
  pages.forEach((p, i) => {
    p.drawText(safe(note), { x: MARGIN, y: 30, size: 7.5, font: doc.regular, color: SOFT })
    const label = `Page ${i + 1} of ${pages.length}`
    const w = doc.regular.widthOfTextAtSize(label, 7.5)
    p.drawText(label, { x: A4[0] - MARGIN - w, y: 30, size: 7.5, font: doc.regular, color: SOFT })
  })
}

/** Content-Disposition value with a filename safe for any filesystem. */
export function attachment(name: string) {
  const clean = safe(name).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return `attachment; filename="${clean}"`
}

export { MARGIN, A4, INK, SOFT, RULE, ACCENT }
