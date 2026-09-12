import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { CommunicationsClient } from './communications-client'
import { smsProvider, smsConfigured } from '@/lib/sms'
import { PAGE_SIZE, pageParam, pageArgs } from '@/lib/paging'

export const dynamic = 'force-dynamic'

export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requirePageRole(ROLES.announcements)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const announcementsPage = pageParam(await searchParams, 'ap')
  const [announcementsTotal, announcements, classes, smsTotal, smsLogs] = await Promise.all([
    prisma.announcement.count({ where: { schoolId } }),
    prisma.announcement.findMany({ where: { schoolId }, orderBy: { createdAt: 'desc' }, ...pageArgs(announcementsPage) }),
    prisma.class.findMany({ where: { schoolId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.smsLog.count({ where: { schoolId } }),
    // First page only; the client fetches later pages from GET /api/sms.
    prisma.smsLog.findMany({ where: { schoolId }, orderBy: { createdAt: 'desc' }, ...pageArgs(1) }),
  ])

  return <CommunicationsClient
    announcements={announcements.map((a: any) => ({
      id: a.id, title: a.title, content: a.content, isPublic: a.isPublic,
      createdAt: a.createdAt?.toISOString() ?? '',
    }))}
    classes={classes}
    pageSize={PAGE_SIZE}
    announcementsPage={announcementsPage} announcementsTotal={announcementsTotal}
    sms={{
      provider: smsProvider().name,
      configured: smsConfigured(),
      total: smsTotal,
      logs: smsLogs.map((l) => ({
        id: l.id, phone: l.phone, message: l.message, status: l.status,
        createdAt: l.createdAt.toISOString(),
      })),
    }}
  />
}
