/**
 * One way to page every long table.
 *
 * Server pages: read `?page=` (or a named param when a page has several
 * tables), run `count` + `findMany({ skip, take })`, pass `{ page, pageSize,
 * total }` to the client, and render <Paginator/> which pushes a new URL.
 * API lists: read `page`/`limit` from the query with the same helper and
 * return `{ items, page, pageSize, total }`.
 */
export const PAGE_SIZE = 50

type Params = Record<string, string | string[] | undefined> | URLSearchParams

function read(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined
  const v = params[key]
  return Array.isArray(v) ? v[0] : v
}

/** Page number from the query (1-based, never below 1). */
export function pageParam(params: Params, key = 'page'): number {
  return Math.max(1, parseInt(read(params, key) ?? '1', 10) || 1)
}

/** Page size from the query, clamped so a client cannot ask for the whole table. */
export function limitParam(params: Params, fallback = PAGE_SIZE, max = 200): number {
  const n = parseInt(read(params, 'limit') ?? '', 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback
}

/** Prisma `skip`/`take` for a page. */
export function pageArgs(page: number, pageSize = PAGE_SIZE) {
  return { skip: (page - 1) * pageSize, take: pageSize }
}

export interface Paged<T> { items: T[]; page: number; pageSize: number; total: number }
export function paged<T>(items: T[], page: number, pageSize: number, total: number): Paged<T> {
  return { items, page, pageSize, total }
}
