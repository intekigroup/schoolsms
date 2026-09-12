'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Paginator, pageHref } from '@/components/ui/paginator'

/** Pager for the staff-view guardian directory. Lives outside ParentsClient so the directory card itself stays untouched. */
export function DirectoryPaginator({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const router = useRouter()
  const params = useSearchParams()
  return <Paginator page={page} pageSize={pageSize} total={total} onPage={(p) => router.push(pageHref('/dashboard/parents', params.toString(), 'page', p))} className="rounded-lg border bg-card" />
}
