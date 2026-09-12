import type { Instrumentation } from 'next'

/** Every unhandled error in a route, page or server action is recorded and, in production, emailed (throttled). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { recordError } = await import('@/lib/error-log')
  await recordError(err, { path: request.path, method: request.method, kind: `${context.routerKind}/${context.routeType}` })
}
