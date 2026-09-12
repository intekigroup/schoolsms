import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib'
import QRCode from 'qrcode'
import { safe } from '@/lib/pdf'
import type { IdCardConfig } from './settings'
import { verifyUrl, type CardKind } from './verify'

/**
 * ID cards as PDF, in two layouts:
 *
 *   card   — one card per page at CR80 size (85.6 × 54 mm), front then back,
 *            for a card printer or a print shop;
 *   sheet  — A4 sheets of cards with crop marks, fronts on one page and the
 *            matching backs on the next (mirrored, for long-edge duplex), for
 *            an office printer and a laminator.
 *
 * Everything is vector except the photo and logo, so a card prints crisp at
 * any resolution. The QR code is drawn as rectangles from the module matrix.
 */

const MM = 72 / 25.4
export const CR80: [number, number] = [85.6 * MM, 54 * MM] // 242.6 × 153.1 pt
const A4: [number, number] = [595.28, 841.89]

export interface CardHolder {
  kind: CardKind
  id: string
  name: string
  /** Second line under the name: class for a pupil, role for staff. */
  subtitle: string | null
  photoUrl: string | null
  /** Label/value rows on the front. */
  fields: [string, string][]
  /** Emergency contact for the back (pupils). */
  emergency: string | null
}

export interface CardSchool {
  name: string
  motto: string | null
  address: string | null
  city: string | null
  region: string | null
  phone: string | null
  email: string | null
  website: string | null
  logoUrl: string | null
}

export interface RenderOptions {
  config: IdCardConfig
  school: CardSchool
  origin: string
  layout: 'card' | 'sheet'
}

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}
const INK = rgb(0.08, 0.1, 0.13)
const SOFT = rgb(0.42, 0.47, 0.53)
const PAPER = rgb(1, 1, 1)
const FRAME = rgb(0.86, 0.89, 0.92)

/**
 * Loads an image for embedding. Accepts data: URLs and http(s) URLs (3 s
 * timeout). Anything that fails yields null and the card falls back to
 * initials — a broken link must never stop a batch of 400 cards.
 */
async function loadImage(pdf: PDFDocument, url: string | null, cache: Map<string, PDFImage | null>): Promise<PDFImage | null> {
  if (!url) return null
  if (cache.has(url)) return cache.get(url)!
  let img: PDFImage | null = null
  try {
    let bytes: Uint8Array | null = null
    let type = ''
    if (url.startsWith('data:')) {
      const m = url.match(/^data:(image\/[a-z+]+);base64,(.+)$/i)
      // A plain Uint8Array: pdf-lib reads offsets from the ArrayBuffer, which a pooled Node Buffer breaks.
      if (m) { type = m[1].toLowerCase(); bytes = Uint8Array.from(Buffer.from(m[2], 'base64')) }
    } else if (/^https?:\/\//i.test(url)) {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (r.ok) { type = (r.headers.get('content-type') ?? '').toLowerCase(); bytes = new Uint8Array(await r.arrayBuffer()) }
    }
    if (bytes) {
      if (type.includes('png')) img = await pdf.embedPng(bytes)
      else if (type.includes('jpeg') || type.includes('jpg')) img = await pdf.embedJpg(bytes)
      else {
        // Unknown type: try both.
        try { img = await pdf.embedJpg(bytes) } catch { img = await pdf.embedPng(bytes) }
      }
    }
  } catch { img = null }
  cache.set(url, img)
  return img
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

function fit(font: PDFFont, text: string, size: number, maxWidth: number): { text: string; size: number } {
  let s = size
  while (s > 6 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5
  if (font.widthOfTextAtSize(text, s) <= maxWidth) return { text, size: s }
  let t = text
  while (t.length > 3 && font.widthOfTextAtSize(`${t}…`, s) > maxWidth) t = t.slice(0, -1)
  return { text: `${t}...`, size: s }
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const para of text.split(/\n/)) {
    let line = ''
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(t, size) > maxWidth && line) { lines.push(line); line = w } else line = t
    }
    lines.push(line)
  }
  return lines
}

interface Ctx { pdf: PDFDocument; regular: PDFFont; bold: PDFFont; opts: RenderOptions; images: Map<string, PDFImage | null>; logo: PDFImage | null }

/** Draws the front of one card with its lower-left corner at (ox, oy). */
async function drawFront(ctx: Ctx, page: PDFPage, h: CardHolder, ox: number, oy: number) {
  const { config, school, origin } = ctx.opts
  const { regular, bold } = ctx
  const landscape = config.orientation === 'landscape'
  const W = landscape ? CR80[0] : CR80[1]
  const H = landscape ? CR80[1] : CR80[0]
  const accent = hex(config.theme.accent), secondary = hex(config.theme.secondary), onAccent = hex(config.theme.onAccent)
  const kindCfg = h.kind === 'student' ? config.student : config.staff
  const T = (t: string) => safe(t)

  // Card body, header band, secondary stripe.
  page.drawRectangle({ x: ox, y: oy, width: W, height: H, color: PAPER, borderColor: FRAME, borderWidth: 0.5 })
  const bandH = landscape ? 30 : 40
  page.drawRectangle({ x: ox, y: oy + H - bandH, width: W, height: bandH, color: accent })
  page.drawRectangle({ x: ox, y: oy + H - bandH - 2.5, width: W, height: 2.5, color: secondary })

  // Header: logo + school name + motto.
  let hx = ox + 8
  if (config.showLogo && ctx.logo) {
    const s = bandH - 10
    const scale = Math.min(s / ctx.logo.width, s / ctx.logo.height)
    page.drawImage(ctx.logo, { x: hx, y: oy + H - bandH + 5, width: ctx.logo.width * scale, height: ctx.logo.height * scale })
    hx += ctx.logo.width * scale + 6
  }
  const nameFit = fit(bold, T(school.name.toUpperCase()), landscape ? 9 : 8.5, W - (hx - ox) - 8)
  page.drawText(nameFit.text, { x: hx, y: oy + H - (landscape ? 13 : 16), size: nameFit.size, font: bold, color: onAccent })
  const sub = config.showMotto && school.motto ? school.motto : [school.city, school.region].filter(Boolean).join(', ')
  if (sub) {
    const f = fit(regular, T(sub), 5.5, W - (hx - ox) - 8)
    page.drawText(f.text, { x: hx, y: oy + H - (landscape ? 23 : 28), size: f.size, font: regular, color: onAccent, opacity: 0.9 })
  }

  // Photo frame.
  const photoW = landscape ? 58 : 70, photoH = landscape ? 70 : 84
  const px = landscape ? ox + 10 : ox + (W - photoW) / 2
  const py = landscape ? oy + H - bandH - 12 - photoH : oy + H - bandH - 10 - photoH
  page.drawRectangle({ x: px - 1.5, y: py - 1.5, width: photoW + 3, height: photoH + 3, color: secondary })
  const photo = await loadImage(ctx.pdf, h.photoUrl, ctx.images)
  if (photo) {
    // Cover-fit: scale to fill, then crop by drawing inside a clipped rectangle is not
    // available in pdf-lib, so scale by the larger ratio and centre; slight overflow
    // is hidden by the frame drawn after.
    const scale = Math.max(photoW / photo.width, photoH / photo.height)
    const w = photo.width * scale, hh = photo.height * scale
    page.drawImage(photo, { x: px + (photoW - w) / 2, y: py + (photoH - hh) / 2, width: w, height: hh })
    // Mask overflow with paper-coloured bars, then redraw the frame.
    page.drawRectangle({ x: ox + 0.5, y: py, width: px - 1.5 - ox - 0.5, height: photoH, color: PAPER })
    page.drawRectangle({ x: px + photoW + 1.5, y: py, width: W - (px + photoW + 1.5 - ox) - 0.5, height: photoH, color: PAPER })
    page.drawRectangle({ x: px - 1.5, y: py - 1.5, width: photoW + 3, height: 1.5, color: secondary })
    page.drawRectangle({ x: px - 1.5, y: py + photoH, width: photoW + 3, height: 1.5, color: secondary })
    page.drawRectangle({ x: px - 1.5, y: py - 1.5, width: 1.5, height: photoH + 3, color: secondary })
    page.drawRectangle({ x: px + photoW, y: py - 1.5, width: 1.5, height: photoH + 3, color: secondary })
  } else {
    page.drawRectangle({ x: px, y: py, width: photoW, height: photoH, color: rgb(0.93, 0.95, 0.97) })
    const ini = initials(h.name)
    const w = bold.widthOfTextAtSize(ini, 22)
    page.drawText(ini, { x: px + (photoW - w) / 2, y: py + photoH / 2 - 8, size: 22, font: bold, color: SOFT })
  }

  // Kind pill under / beside the photo.
  const pillW = bold.widthOfTextAtSize(T(kindCfg.title), 6) + 10
  const pillX = landscape ? px + (photoW - pillW) / 2 : px + (photoW - pillW) / 2
  const pillY = py - 11
  page.drawRectangle({ x: pillX, y: pillY, width: pillW, height: 9, color: accent })
  page.drawText(T(kindCfg.title), { x: pillX + 5, y: pillY + 2.2, size: 6, font: bold, color: onAccent })

  // Name and details.
  const tx = landscape ? px + photoW + 12 : ox + 10
  const textW = landscape ? W - (tx - ox) - 10 - (config.qr.enabled ? 42 : 0) : W - 20
  let ty = landscape ? oy + H - bandH - 18 : py - 24
  const nf = fit(bold, T(h.name), landscape ? 11 : 11.5, textW)
  page.drawText(nf.text, { x: tx, y: ty, size: nf.size, font: bold, color: INK })
  ty -= 11
  if (h.subtitle) {
    const sf = fit(regular, T(h.subtitle), 8, textW)
    page.drawText(sf.text, { x: tx, y: ty, size: sf.size, font: regular, color: accent })
    ty -= 12
  } else ty -= 3
  for (const [label, value] of h.fields) {
    if (ty < oy + 14) break
    page.drawText(T(label.toUpperCase()), { x: tx, y: ty, size: 5, font: bold, color: SOFT })
    const vf = fit(regular, T(value), 7.5, textW)
    page.drawText(vf.text, { x: tx, y: ty - 8, size: vf.size, font: regular, color: INK })
    ty -= 17
  }

  // QR code, bottom right.
  if (config.qr.enabled) {
    const size = landscape ? 36 : 34
    const qx = ox + W - size - 8, qy = oy + 8
    drawQr(page, verifyUrl(origin, h.kind, h.id), qx, qy, size)
    page.drawText('SCAN TO VERIFY', { x: qx + (size - bold.widthOfTextAtSize('SCAN TO VERIFY', 3.8)) / 2, y: qy - 5.5, size: 3.8, font: bold, color: SOFT })
  }
  // Validity, bottom left.
  if (kindCfg.validUntil) {
    page.drawText(T(`Valid until ${kindCfg.validUntil}`), { x: ox + 10, y: oy + 6, size: 5.5, font: regular, color: SOFT })
  }
}

function drawBack(ctx: Ctx, page: PDFPage, h: CardHolder, ox: number, oy: number) {
  const { config, school } = ctx.opts
  const { regular, bold } = ctx
  const landscape = config.orientation === 'landscape'
  const W = landscape ? CR80[0] : CR80[1]
  const H = landscape ? CR80[1] : CR80[0]
  const accent = hex(config.theme.accent), secondary = hex(config.theme.secondary)
  const T = (t: string) => safe(t)

  page.drawRectangle({ x: ox, y: oy, width: W, height: H, color: PAPER, borderColor: FRAME, borderWidth: 0.5 })
  page.drawRectangle({ x: ox, y: oy + H - 6, width: W, height: 6, color: accent })
  page.drawRectangle({ x: ox, y: oy + H - 8, width: W, height: 2, color: secondary })

  let y = oy + H - 20
  const x = ox + 10, textW = W - 20
  page.drawText(T(school.name.toUpperCase()), { x, y, size: 7, font: bold, color: accent }); y -= 11

  if (config.back.note) {
    for (const line of wrap(regular, T(config.back.note), 5.5, textW)) {
      if (y < oy + 40) break
      page.drawText(line, { x, y, size: 5.5, font: regular, color: INK }); y -= 7
    }
    y -= 3
  }
  if (h.kind === 'student' && config.back.showEmergencyContact) {
    page.drawText('EMERGENCY CONTACT', { x, y, size: 5, font: bold, color: SOFT }); y -= 8
    page.drawText(T(h.emergency ?? 'Not recorded'), { x, y, size: 7, font: regular, color: INK }); y -= 12
  }
  const returnTo = config.back.returnTo || [school.address, [school.city, school.region].filter(Boolean).join(', '), school.phone].filter(Boolean).join(' · ')
  if (returnTo) {
    page.drawText('IF FOUND, PLEASE RETURN TO', { x, y, size: 5, font: bold, color: SOFT }); y -= 8
    for (const line of wrap(regular, T(returnTo), 6, textW).slice(0, 2)) { page.drawText(line, { x, y, size: 6, font: regular, color: INK }); y -= 7.5 }
  }
  if (config.back.showSignature) {
    const sx = ox + W - 80, sy = oy + 16
    page.drawLine({ start: { x: sx, y: sy }, end: { x: ox + W - 10, y: sy }, thickness: 0.5, color: SOFT })
    page.drawText(T(config.back.signatureLabel || 'Authorised signature'), { x: sx, y: sy - 7, size: 5, font: regular, color: SOFT })
  }
  const contact = [school.phone, school.email, school.website].filter(Boolean).join('  ·  ')
  if (contact) {
    const f = fit(regular, T(contact), 5, textW)
    page.drawText(f.text, { x, y: oy + 6, size: f.size, font: regular, color: SOFT })
  }
}

function drawQr(page: PDFPage, value: string, x: number, y: number, size: number) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const cell = size / n
  page.drawRectangle({ x: x - 2, y: y - 2, width: size + 4, height: size + 4, color: PAPER })
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue
      page.drawRectangle({ x: x + c * cell, y: y + size - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: INK })
    }
  }
}

function cropMarks(page: PDFPage, x: number, y: number, w: number, h: number) {
  const L = 8, g = 2
  const c = rgb(0.6, 0.6, 0.6)
  const marks: [number, number, number, number][] = [
    [x - g - L, y, x - g, y], [x, y - g - L, x, y - g],
    [x + w + g, y, x + w + g + L, y], [x + w, y - g - L, x + w, y - g],
    [x - g - L, y + h, x - g, y + h], [x, y + h + g, x, y + h + g + L],
    [x + w + g, y + h, x + w + g + L, y + h], [x + w, y + h + g, x + w, y + h + g + L],
  ]
  for (const [x1, y1, x2, y2] of marks) page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.3, color: c })
}

export async function renderIdCards(holders: CardHolder[], opts: RenderOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`ID cards · ${opts.school.name}`)
  pdf.setCreator('Shule SMS')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const images = new Map<string, PDFImage | null>()
  const logo = opts.config.showLogo ? await loadImage(pdf, opts.school.logoUrl, images) : null
  const ctx: Ctx = { pdf, regular, bold, opts, images, logo }
  const landscape = opts.config.orientation === 'landscape'
  const W = landscape ? CR80[0] : CR80[1]
  const H = landscape ? CR80[1] : CR80[0]

  if (opts.layout === 'card') {
    for (const h of holders) {
      const front = pdf.addPage([W, H])
      await drawFront(ctx, front, h, 0, 0)
      if (opts.config.back.enabled) drawBack(ctx, pdf.addPage([W, H]), h, 0, 0)
    }
    return pdf.save()
  }

  // A4 sheet: as many columns/rows as fit with a gutter; fronts page then backs page (mirrored).
  const gutter = 10
  const cols = Math.floor((A4[0] - 40) / (W + gutter))
  const rows = Math.floor((A4[1] - 40) / (H + gutter))
  const perPage = cols * rows
  const gridW = cols * W + (cols - 1) * gutter, gridH = rows * H + (rows - 1) * gutter
  const left = (A4[0] - gridW) / 2, top = (A4[1] - gridH) / 2
  for (let i = 0; i < holders.length; i += perPage) {
    const chunk = holders.slice(i, i + perPage)
    const front = pdf.addPage(A4)
    for (const [j, h] of chunk.entries()) {
      const col = j % cols, row = Math.floor(j / cols)
      const x = left + col * (W + gutter), y = A4[1] - top - (row + 1) * H - row * gutter
      await drawFront(ctx, front, h, x, y)
      if (opts.config.sheet.cropMarks) cropMarks(front, x, y, W, H)
    }
    if (opts.config.back.enabled) {
      const back = pdf.addPage(A4)
      for (const [j, h] of chunk.entries()) {
        const col = cols - 1 - (j % cols), row = Math.floor(j / cols) // mirrored for duplex
        const x = left + col * (W + gutter), y = A4[1] - top - (row + 1) * H - row * gutter
        drawBack(ctx, back, h, x, y)
        if (opts.config.sheet.cropMarks) cropMarks(back, x, y, W, H)
      }
    }
  }
  return pdf.save()
}
