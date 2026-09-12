/** Tanzania's 31 regions, for registration forms. */
export const TZ_REGIONS = [
  'Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Katavi', 'Kigoma', 'Kilimanjaro', 'Lindi',
  'Manyara', 'Mara', 'Mbeya', 'Morogoro', 'Mtwara', 'Mwanza', 'Njombe', 'Pemba North', 'Pemba South', 'Pwani',
  'Rukwa', 'Ruvuma', 'Shinyanga', 'Simiyu', 'Singida', 'Songwe', 'Tabora', 'Tanga', 'Unguja North', 'Unguja South', 'Mjini Magharibi',
] as const

export const SCHOOL_TYPES = [
  { value: 'PRIVATE', en: 'Private (owner-run)', sw: 'Binafsi (ya mmiliki)' },
  { value: 'FAITH', en: 'Faith-based (church / mosque)', sw: 'Ya dini (kanisa / msikiti)' },
  { value: 'COMMUNITY', en: 'Community / NGO', sw: 'Ya jamii / NGO' },
  { value: 'INTERNATIONAL', en: 'International curriculum', sw: 'Mtaala wa kimataifa' },
  { value: 'OTHER', en: 'Other', sw: 'Nyingine' },
] as const

export const PUPIL_BANDS = [
  { value: 50, label: 'Up to 50' }, { value: 150, label: '51 – 150' }, { value: 300, label: '151 – 300' },
  { value: 600, label: '301 – 600' }, { value: 1000, label: '601 – 1,000' }, { value: 2000, label: 'More than 1,000' },
] as const

export const REFERRAL_SOURCES = [
  { value: 'WHATSAPP', en: 'WhatsApp / a message', sw: 'WhatsApp / ujumbe' },
  { value: 'ANOTHER_SCHOOL', en: 'Another school', sw: 'Shule nyingine' },
  { value: 'SEARCH', en: 'Google search', sw: 'Utafutaji wa Google' },
  { value: 'SOCIAL', en: 'Facebook / Instagram', sw: 'Facebook / Instagram' },
  { value: 'EVENT', en: 'An event or visit', sw: 'Tukio au ziara' },
  { value: 'OTHER', en: 'Other', sw: 'Nyingine' },
] as const

/** Default Tanzanian three-term year for a given calendar year. */
export function defaultTerms(year: number) {
  return [
    { name: 'Term 1', startDate: `${year}-01-12`, endDate: `${year}-03-27` },
    { name: 'Term 2', startDate: `${year}-05-04`, endDate: `${year}-08-14` },
    { name: 'Term 3', startDate: `${year}-09-07`, endDate: `${year}-11-27` },
  ]
}
