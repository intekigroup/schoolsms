import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const pages: { path: string; priority: number; alt?: string }[] = [
    { path: '/', priority: 1, alt: '/sw' },
    { path: '/sw', priority: 0.9, alt: '/' },
    { path: '/features', priority: 0.8 },
    { path: '/pricing', priority: 0.8 },
    { path: '/demo', priority: 0.7 },
    { path: '/about', priority: 0.5 },
    { path: '/contact', priority: 0.6 },
    { path: '/terms', priority: 0.3 },
    { path: '/privacy', priority: 0.3 },
  ]
  return pages.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: p.priority,
    ...(p.alt ? { alternates: { languages: { en: `${SITE_URL}${p.path === '/sw' ? '/' : p.path}`, sw: `${SITE_URL}${p.path === '/' ? '/sw' : p.path}` } } } : {}),
  }))
}
