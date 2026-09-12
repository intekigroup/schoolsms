import { requirePageRole, ROLES } from '@/lib/authz'
import { MessagesClient } from './messages-client'

export const dynamic = 'force-dynamic'

/** Teacher ↔ guardian messages about a pupil. */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ with?: string; studentId?: string }> }) {
  const session = await requirePageRole(ROLES.messaging)
  const { with: withId, studentId } = await searchParams
  return <MessagesClient me={session.user.id} role={session.user.role} initial={withId && studentId ? { userId: withId, studentId } : null} />
}
