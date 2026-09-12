'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, ArrowRight } from 'lucide-react'

/**
 * A slim banner across every marketing page. Dismissal is remembered per
 * browser, keyed by the message id, so changing the message brings it back.
 */
const ID = 'free-50'
const KEY = `shule-announcement-${ID}`

export function AnnouncementBar() {
  // Shown on the server render so there is no layout shift and it works
  // without JavaScript; a viewer who dismissed it earlier sees it hide on mount.
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === 'dismissed') setVisible(false)
    } catch { /* private mode: keep it visible */ }
  }, [])

  const dismiss = () => {
    setVisible(false)
    try { localStorage.setItem(KEY, 'dismissed') } catch { /* private mode */ }
  }

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label="Announcement"
      className="relative border-b border-primary/20 bg-primary/10 text-sm"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-12 py-2 text-center">
        <span className="hidden h-1.5 w-1.5 rounded-full bg-secondary sm:inline-block" />
        <p>
          <span className="font-semibold">Free for 50 pupils</span>
          <span className="text-muted-foreground"> — no card, no expiry. </span>
          <Link href="/signup" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Create your school <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-primary/15 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
