import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/** Public marketing pages are indexable; the app, APIs and verification pages are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/sw', '/features', '/pricing', '/about', '/contact', '/demo', '/terms', '/privacy'], disallow: ['/dashboard', '/api', '/verify', '/login', '/signup', '/reset-password', '/forgot-password', '/verify-email'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
