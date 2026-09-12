'use client'

import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useI18n } from '@/lib/i18n-context'

/**
 * "Showing 51–100 of 312 · Previous · Page 2 of 7 · Next". Renders nothing
 * when everything fits on one page, so it can sit under every table.
 */
export function Paginator({ page, pageSize, total, onPage, className = '' }: { page: number; pageSize: number; total: number; onPage: (page: number) => void; className?: string }) {
  const { t } = useI18n()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1, to = Math.min(total, page * pageSize)
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm text-muted-foreground ${className}`}>
      <span>{t('common.showing')} {from}–{to} {t('common.of')} {total}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} className="gap-1"><ChevronLeft className="h-4 w-4" /> {t('common.previous')}</Button>
        <span>{t('common.page')} {page} {t('common.of')} {pages}</span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} className="gap-1">{t('common.next')} <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

/** Builds the URL for a page while keeping the other query params (search, filters, other tables' pages). */
export function pageHref(pathname: string, current: URLSearchParams | string, key: string, page: number) {
  const sp = new URLSearchParams(typeof current === 'string' ? current : current.toString())
  if (page > 1) sp.set(key, String(page)); else sp.delete(key)
  const qs = sp.toString()
  return qs ? `${pathname}?${qs}` : pathname
}
