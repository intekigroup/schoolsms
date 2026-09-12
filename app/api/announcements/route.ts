import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const guard = await requireApiRole(ROLES.announcements, req)
    if (!guard.ok) return guard.response
    const { schoolId } = guard

    const body = await req.json()
    const { title, content, isPublic } = body
    if (!title || !content) return NextResponse.json({ error: 'Title and content are required' }, { status: 400 })

    const announcement = await prisma.announcement.create({
      data: { title, content, isPublic: isPublic ?? true, schoolId },
    })

    // Fan out an in-app notification to relevant users in the school.
    // Public announcements reach everyone in the school; staff-only ones skip parents/students.
    const recipientRoles = (isPublic ?? true)
      ? undefined
      : { in: ['SCHOOL_ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN'] as any }
    const recipients = await prisma.user.findMany({
      where: { schoolId, ...(recipientRoles ? { role: recipientRoles } : {}) },
      select: { id: true },
    })
    if (recipients.length > 0) {
      await prisma.notification.createMany({
        data: recipients.map((u: any) => ({
          title: `📢 ${title}`,
          message: content.length > 140 ? content.slice(0, 140) + '…' : content,
          userId: u.id,
        })),
      })
    }

    return NextResponse.json({ success: true, announcement })
  } catch (e: any) {
    console.error('Announcement POST error:', e)
    return NextResponse.json({ error: 'Failed to post announcement' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const guard = await requireApiRole(ROLES.announcements, req)
    if (!guard.ok) return guard.response
    const { schoolId } = guard

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.announcement.findFirst({ where: { id, schoolId } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.announcement.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Announcement DELETE error:', e)
    return NextResponse.json({ error: 'Failed to delete announcement' }, { status: 500 })
  }
}
