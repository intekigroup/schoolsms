/**
 * The address block printed under a school's name on every document, and
 * previewed in Settings. Pure, so the client can import it without pulling
 * in pdf-lib.
 */
export interface Letterhead {
  address?: string | null
  poBox?: string | null
  city?: string | null
  district?: string | null
  region?: string | null
}

/** "P.O. Box 1234 Moshi, Rau ward, Kilimanjaro" — the town is not repeated when the P.O. Box already names it. */
export function addressLine(school: Letterhead) {
  const town = school.district || school.city || null
  const box = school.poBox ? school.poBox.replace(/^p\.?o\.?\s*box\s*/i, '').trim() : null
  const townInBox = !!(town && box && new RegExp(`\\b${town.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(box))
  const region = school.region && school.region !== town ? school.region : null
  return [box ? `P.O. Box ${box}` : null, school.address, townInBox ? null : town, region].filter(Boolean).join(', ')
}
