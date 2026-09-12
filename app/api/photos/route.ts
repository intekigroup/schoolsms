export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'

/**
 * Passport photo upload for a pupil or a staff member. The image is resized to
 * a 3:4 portrait, re-encoded as JPEG (~15 KB) and stored inline on the record
 * as a data URL, so it survives backups and restores with the row and needs no
 * file store. Anything sharp cannot decode is refused.
 *
 *   POST multipart/form-data  kind=student|staff  id=…  file=<image>
 *   POST multipart/form-data  kind=logo  file=<image>     (school admin; fits 512×512, PNG, transparency kept)
 *   DELETE ?kind=…&id=…   |   DELETE ?kind=logo
 */
const MAX_UPLOAD = 8 * 1024 * 1024

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  const kind = String(form.get('kind') ?? '')
  if (kind === 'logo') return uploadLogo(req, form)
  const guard = await requireApiRole(ROLES.idCards, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const id = String(form.get('id') ?? '')
  const file = form.get('file')
  if ((kind !== 'student' && kind !== 'staff') || !id) return NextResponse.json({ error: 'kind and id are required' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (file.size > MAX_UPLOAD) return NextResponse.json({ error: 'Image is larger than 8 MB' }, { status: 413 })

  let dataUrl: string
  try {
    const out = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(360, 480, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
    dataUrl = `data:image/jpeg;base64,${out.toString('base64')}`
  } catch {
    return NextResponse.json({ error: 'That file is not an image we can read (use JPEG or PNG)' }, { status: 400 })
  }

  const who = kind === 'student'
    ? await prisma.student.findFirst({ where: { id, schoolId }, select: { id: true, firstName: true, lastName: true } })
    : await prisma.staff.findFirst({ where: { id, schoolId }, select: { id: true, firstName: true, lastName: true } })
  if (!who) return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  if (kind === 'student') await prisma.student.update({ where: { id }, data: { photoUrl: dataUrl } })
  else await prisma.staff.update({ where: { id }, data: { photoUrl: dataUrl } })
  await record(guard.session, { action: 'update', entity: kind === 'student' ? 'Student' : 'Staff', entityId: id, summary: `Uploaded a photo for ${who.firstName} ${who.lastName}` })
  return NextResponse.json({ success: true, photoUrl: dataUrl, bytes: Math.round((dataUrl.length * 3) / 4) })
}

/** The school logo: only the school admin, and it lives on School.logoUrl so every letterhead picks it up. */
async function uploadLogo(req: Request, form: FormData) {
  const guard = await requireApiRole(ROLES.settingsWrite, req)
  if (!guard.ok) return guard.response
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (file.size > MAX_UPLOAD) return NextResponse.json({ error: 'Image is larger than 8 MB' }, { status: 413 })
  let dataUrl: string
  try {
    const out = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer()
    dataUrl = `data:image/png;base64,${out.toString('base64')}`
  } catch {
    return NextResponse.json({ error: 'That file is not an image we can read (use PNG or JPEG)' }, { status: 400 })
  }
  await prisma.school.update({ where: { id: guard.schoolId }, data: { logoUrl: dataUrl } })
  await record(guard.session, { action: 'update', entity: 'School', entityId: guard.schoolId, summary: 'Uploaded the school logo' })
  return NextResponse.json({ success: true, photoUrl: dataUrl, bytes: Math.round((dataUrl.length * 3) / 4) })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('kind'), id = searchParams.get('id') ?? ''
  if (kind === 'logo') {
    const g = await requireApiRole(ROLES.settingsWrite, req)
    if (!g.ok) return g.response
    await prisma.school.update({ where: { id: g.schoolId }, data: { logoUrl: null } })
    await record(g.session, { action: 'update', entity: 'School', entityId: g.schoolId, summary: 'Removed the school logo' })
    return NextResponse.json({ success: true })
  }
  const guard = await requireApiRole(ROLES.idCards, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  if ((kind !== 'student' && kind !== 'staff') || !id) return NextResponse.json({ error: 'kind and id are required' }, { status: 400 })
  const res = kind === 'student'
    ? await prisma.student.updateMany({ where: { id, schoolId }, data: { photoUrl: null } })
    : await prisma.staff.updateMany({ where: { id, schoolId }, data: { photoUrl: null } })
  if (res.count === 0) return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  await record(guard.session, { action: 'update', entity: kind === 'student' ? 'Student' : 'Staff', entityId: id, summary: 'Removed a photo' })
  return NextResponse.json({ success: true })
}
