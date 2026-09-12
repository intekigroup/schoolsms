import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler'
import { Providers } from '@/components/providers'
import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site'

export const dynamic = 'force-dynamic'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })
const jakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Shule SMS — School management for Tanzanian private schools', template: '%s · Shule SMS' },
  description: 'Registers, marks, fees in shillings, SMS to parents, report cards, payroll and accounting — built for how Tanzanian private schools run, from nursery to Form 6.',
  applicationName: 'Shule SMS',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
  openGraph: {
    type: 'website',
    siteName: 'Shule SMS',
    locale: 'en_TZ',
    alternateLocale: ['sw_TZ'],
    title: 'Shule SMS — School management for Tanzanian private schools',
    description: 'Registers, marks, fees in shillings, SMS to parents, report cards, payroll and accounting — from nursery to Form 6.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Shule SMS' }],
  },
  twitter: { card: 'summary_large_image' },
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0090C1" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
      </head>
      <body className={`${dmSans.variable} ${jakartaSans.variable} ${jetbrainsMono.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            {children}
          </Providers>
          <Toaster />
          <ChunkLoadErrorHandler />
        </ThemeProvider>
      </body>
    </html>
  )
}
