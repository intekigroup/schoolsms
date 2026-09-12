/**
 * Schools shown in the "Schools using Shule SMS" section of the landing page.
 *
 * Only real, named schools that have agreed to be listed belong here. Leave the
 * list empty and the section shows the founding-schools offer instead of a
 * fake customer strip. Optional fields are simply not rendered.
 */
export interface ReferenceSchool {
  name: string
  /** Town / region, e.g. "Arusha" */
  place: string
  /** e.g. "Primary", "O-level & A-level", "Nursery to Form 4" */
  levels: string
  /** Approximate roll, shown as "~320 pupils" */
  pupils?: number
  /** A short quote from the head teacher or bursar, and who said it. */
  quote?: string
  person?: string
  /** Path under /public, e.g. "/schools/st-joseph.png". Initials are shown when absent. */
  logo?: string
  /** Since when, e.g. "2026" */
  since?: string
}

export const REFERENCE_SCHOOLS: ReferenceSchool[] = [
  // Example of an entry (remove the leading // once a real school has agreed):
  // { name: 'St. Joseph Primary School', place: 'Arusha', levels: 'Nursery to Standard 7', pupils: 320, since: '2026',
  //   quote: 'Report cards that used to take the office a week now print in an afternoon.', person: 'Head teacher' },
]
