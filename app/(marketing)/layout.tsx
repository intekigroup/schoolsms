import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { isStandalone } from '@/lib/edition'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { AnnouncementBar } from '@/components/marketing/announcement-bar'

export const dynamic = 'force-dynamic'

/**
 * Public marketing pages share the product's design system and theme, so a
 * head teacher moving from /pricing to /signup to /dashboard never feels a seam.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  // A self-hosted school has no public website to show; go to the app.
  if (isStandalone()) redirect(session?.user ? '/dashboard' : '/login')
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AnnouncementBar />
      <SiteNav signedIn={Boolean(session?.user)} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
