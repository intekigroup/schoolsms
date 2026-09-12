import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { DashboardShell } from './dashboard-shell'
import { capabilitiesFor } from '@/lib/authz'
import { t, type Locale } from '@/lib/i18n'
import { I18nProvider } from '@/lib/i18n-context'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  
  const user = {
    id: session.user.id ?? '',
    name: session.user.name ?? '',
    email: session.user.email ?? '',
    role: session.user.role ?? 'STUDENT',
    schoolId: session.user.schoolId ?? null,
    locale: session.user.locale ?? 'en',
    image: session.user.image ?? null,
    caps: await capabilitiesFor(session),
  }

  // Anything other than ACTIVE puts the school in read-only; say so plainly
  // rather than letting every save fail with an unexplained error.
  const status = session.user.subscriptionStatus
  const readOnly = user.role !== 'SUPER_ADMIN' && Boolean(status) && status !== 'ACTIVE'

  return (
    // A nested provider seeded from the account, so server-rendered HTML is already in the user's language (no English flash).
    <I18nProvider defaultLocale={(user.locale === 'sw' ? 'sw' : 'en') as Locale}>
    <DashboardShell user={user}>
      {readOnly && (
        <div className="mb-4 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <span className="font-medium">{t('common.readOnlyTitle', user.locale as Locale, { status: String(status).toLowerCase() })}</span>{' '}
            {t('common.readOnlyBody', user.locale as Locale)}
          </p>
        </div>
      )}
      {children}
    </DashboardShell>
    </I18nProvider>
  )
}
