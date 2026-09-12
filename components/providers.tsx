'use client'

import { SessionProvider } from 'next-auth/react'
import { I18nProvider } from '@/lib/i18n-context'
import { ServiceWorkerRegistrar } from '@/components/service-worker'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <I18nProvider>
        <ServiceWorkerRegistrar />
        {children}
      </I18nProvider>
    </SessionProvider>
  )
}
