import { requireApiUser } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// List the current user's notifications + unread count
export async function GET() {
  try {
    const guard = await requireApiUser()
    if (!guard.ok) return guard.response
    const { userId } = guard

    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ])

    return NextResponse.json({
      unread,
      notifications: notifications.map((n: any) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
    })
  } catch (e: any) {
    console.error('Notifications GET error:', e)
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 })
  }
}

// Mark notifications as read. Body: { id } to mark one, or { all: true } to mark all.
export async function PATCH(req: Request) {
  try {
    const guard = await requireApiUser()
    if (!guard.ok) return guard.response
    const { userId } = guard

    const body = await req.json().catch(() => ({}))
    if (body?.all) {
      await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } })
    } else if (body?.id) {
      // Tenant/user isolation: only update rows owned by this user
      await prisma.notification.updateMany({ where: { id: body.id, userId }, data: { isRead: true } })
    } else {
      return NextResponse.json({ error: 'Missing id or all flag' }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Notifications PATCH error:', e)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}
