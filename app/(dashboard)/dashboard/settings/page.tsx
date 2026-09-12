import { requirePageRole, ROLES } from '@/lib/authz'
import { SettingsClient } from './settings-client'

export const dynamic = 'force-dynamic'

const TABS = ["school", "academic", "reports", "idcards", "hr", "accounting", "roles", "security"]

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requirePageRole(ROLES.settingsRead)
  const { tab } = await searchParams
  return <SettingsClient initialTab={TABS.includes(tab ?? '') ? (tab as string) : 'school'} canEdit={session.user.role === 'SCHOOL_ADMIN'} />
}
