import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { EventsClient } from './events-client'

export const dynamic = 'force-dynamic'

export default async function EventsPage() {
  const session = await requirePageRole(ROLES.events)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const events = await prisma.event.findMany({ where: { schoolId }, orderBy: { startDate: 'desc' } })

  return <EventsClient events={events.map((e: any) => ({
    id: e.id, title: e.title, description: e.description ?? '',
    startDate: e.startDate?.toISOString() ?? '', endDate: e.endDate?.toISOString() ?? '',
    location: e.location ?? '',
  }))} />
}
