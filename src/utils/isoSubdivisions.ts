/**
 * ISO 3166-2 subdivisions — where a company is registered, one level finer than
 * the country.
 *
 * Sparse by nature: GLEIF states a subdivision for about 1% of records, and only
 * six countries use them at all (US, CA, KN, AE, MY, and Scotland for GB). That is
 * not a gap in the data — most registers are national, so there is nothing finer
 * to record. **Absent means "not stated", never "none".**
 *
 * Worth the table for one reason: 35 of the 47 American companies in the dev graph
 * are `US-DE`. Delaware is the single most interesting fact the country-level map
 * cannot show.
 *
 * English names only. `Intl.DisplayNames` has no `subdivision` type — region,
 * language, script, currency, calendar and dateTimeField are the whole list — so
 * unlike countries there is nothing to localise *from*, and hand-translating 70
 * place names into three languages would be inventing data. Most are proper nouns
 * that do not translate anyway.
 */

/** US states and DC, plus the territories that appear in company registers. */
const US_SUBDIVISIONS: Record<string, string> = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia',
  HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa',
  KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland',
  MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri',
  MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey',
  NM:'New Mexico', NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio',
  OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina',
  SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
  VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
  DC:'District of Columbia', PR:'Puerto Rico', VI:'U.S. Virgin Islands',
  GU:'Guam', AS:'American Samoa', MP:'Northern Mariana Islands',
}

/** Canadian provinces and territories — the second-largest user of subdivisions. */
const CA_SUBDIVISIONS: Record<string, string> = {
  AB:'Alberta', BC:'British Columbia', MB:'Manitoba', NB:'New Brunswick',
  NL:'Newfoundland and Labrador', NS:'Nova Scotia', NT:'Northwest Territories',
  NU:'Nunavut', ON:'Ontario', PE:'Prince Edward Island', QC:'Quebec',
  SK:'Saskatchewan', YT:'Yukon',
}

/** The rest, small enough to keep flat. Note KN and MY use numeric second parts. */
const OTHER_SUBDIVISIONS: Record<string, string> = {
  'GB-ENG':'England', 'GB-SCT':'Scotland', 'GB-WLS':'Wales', 'GB-NIR':'Northern Ireland',
  'AE-DU':'Dubai', 'AE-AZ':'Abu Dhabi', 'AE-SH':'Sharjah', 'AE-RK':'Ras Al Khaimah',
  'AE-AJ':'Ajman', 'AE-FU':'Fujairah', 'AE-UQ':'Umm Al Quwain',
  'KN-N':'Nevis', 'KN-K':'Saint Kitts',
}

export const SUBDIVISION_NAMES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(US_SUBDIVISIONS).map(([c, n]) => [`US-${c}`, n])),
  ...Object.fromEntries(Object.entries(CA_SUBDIVISIONS).map(([c, n]) => [`CA-${c}`, n])),
  ...OTHER_SUBDIVISIONS,
}

/** True for an ISO 3166-2 code (`US-DE`) rather than a country code (`US`). */
export function isSubdivision(code: string | null | undefined): boolean {
  return !!code && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(code.toUpperCase())
}

/** The country a subdivision belongs to: `US-DE` → `US`. */
export function subdivisionCountry(code: string): string {
  return code.toUpperCase().split('-')[0]
}

/**
 * A subdivision's display name, falling back to the code itself.
 *
 * Falling back rather than hiding: a code we have no name for is still a real
 * place with real companies in it, and `US-XX` tells the reader more than an
 * empty row or a silently dropped one.
 */
export function subdivisionName(code: string): string {
  return SUBDIVISION_NAMES[code.toUpperCase()] ?? code
}

/**
 * FIPS state code → ISO 3166-2, for joining the us-atlas TopoJSON to our data.
 *
 * us-atlas geometries are keyed by two-digit FIPS (`"10"` is Delaware), which is
 * a different numbering from anything we store. Matching on the geometry's
 * `properties.name` instead would tie the join to Natural Earth's spelling of
 * each state, which is not a contract anyone maintains for us.
 */
export const FIPS_TO_SUBDIVISION: Record<string, string> = {
  '01':'US-AL', '02':'US-AK', '04':'US-AZ', '05':'US-AR', '06':'US-CA',
  '08':'US-CO', '09':'US-CT', '10':'US-DE', '11':'US-DC', '12':'US-FL',
  '13':'US-GA', '15':'US-HI', '16':'US-ID', '17':'US-IL', '18':'US-IN',
  '19':'US-IA', '20':'US-KS', '21':'US-KY', '22':'US-LA', '23':'US-ME',
  '24':'US-MD', '25':'US-MA', '26':'US-MI', '27':'US-MN', '28':'US-MS',
  '29':'US-MO', '30':'US-MT', '31':'US-NE', '32':'US-NV', '33':'US-NH',
  '34':'US-NJ', '35':'US-NM', '36':'US-NY', '37':'US-NC', '38':'US-ND',
  '39':'US-OH', '40':'US-OK', '41':'US-OR', '42':'US-PA', '44':'US-RI',
  '45':'US-SC', '46':'US-SD', '47':'US-TN', '48':'US-TX', '49':'US-UT',
  '50':'US-VT', '51':'US-VA', '53':'US-WA', '54':'US-WV', '55':'US-WI',
  '56':'US-WY', '60':'US-AS', '66':'US-GU', '69':'US-MP', '72':'US-PR',
  '78':'US-VI',
}

/** The subdivision a us-atlas geometry id refers to, or null if unmapped. */
export function subdivisionForFips(id: string | number): string | null {
  return FIPS_TO_SUBDIVISION[String(id).padStart(2, '0')] ?? null
}

/**
 * Countries this build can draw a subdivision map for.
 *
 * Canada states subdivisions and gets the panel breakdown, but there is no
 * bundled Canadian geometry and nine companies do not justify sourcing one.
 */
export const DRILLABLE_COUNTRIES = ['US']
