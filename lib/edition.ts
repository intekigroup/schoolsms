/**
 * Two editions of the same codebase:
 *
 *   saas        — multi-tenant, hosted by the vendor. Public sign-up creates a
 *                 school; subscriptions are quoted, invoiced and enforced.
 *   standalone  — one school on its own server. No marketing site, no public
 *                 sign-up, no subscription gating, no billing. The office
 *                 provisions every account.
 *
 * Set APP_EDITION=standalone in .env for a self-hosted install. Anything else
 * (or nothing) is the hosted SaaS.
 */
export type Edition = 'saas' | 'standalone'

export const EDITION: Edition = process.env.APP_EDITION === 'standalone' ? 'standalone' : 'saas'

export const isSaas = () => EDITION === 'saas'
export const isStandalone = () => EDITION === 'standalone'
