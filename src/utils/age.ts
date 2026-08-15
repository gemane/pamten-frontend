/**
 * A person's age, from a birth date that is often incomplete.
 *
 * The register decides the precision, and the two sources differ:
 *
 *   1951-08       UK PSC — Companies House publishes month and year only,
 *                 deliberately, so a day is not available to us either
 *   1898-12-24    Wikidata — a full date for a public figure
 *
 * With no day, the age is one of two numbers for the whole birth month. This
 * returns the **lower** one: without a day we cannot know the birthday has
 * happened, and saying someone is older than they are is the worse error.
 *
 * Only ever asked about the LIVING. A person who has died keeps their dates on
 * screen, because those bound the period in which they could have held control —
 * which is the question an ownership record exists to answer, and one an age
 * that changes every year cannot.
 */

/** Parsed to (year, month, day) — month and day 1-based, null when absent. */
function parts(value: string | null | undefined): { y: number; m: number | null; d: number | null } | null {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec((value ?? '').trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = m[2] ? Number(m[2]) : null
  const da = m[3] ? Number(m[3]) : null
  if (mo !== null && (mo < 1 || mo > 12)) return null
  if (da !== null && (da < 1 || da > 31)) return null
  return { y, m: mo, d: da }
}

/**
 * Whole years between two dates, counting a birthday as passed only when we know
 * it has. `on` defaults to today; pass a death date for an age at death.
 *
 * Null when the birth date is missing or unparseable, when it is in the future,
 * or when the result is implausible — a wrong age presented as a fact is worse
 * than an absent one, and bad dates do occur in these registers.
 */
export function ageFrom(
  birth: string | null | undefined,
  on: string | Date | null = new Date(),
): number | null {
  const b = parts(birth)
  if (!b) return null

  const ref = on instanceof Date ? on : (on ? new Date(on) : new Date())
  if (Number.isNaN(ref.getTime())) return null
  const ry = ref.getFullYear()
  const rm = ref.getMonth() + 1
  const rd = ref.getDate()

  let age = ry - b.y
  if (b.m === null) {
    // Year only: they turn `age` at some point this year, so until it happens
    // they may still be a year younger. Take the lower bound.
    age -= 1
  } else if (rm < b.m) {
    age -= 1
  } else if (rm === b.m) {
    // The birth month. With a day we know; without one we do not, and the lower
    // number is the one we can stand behind.
    if (b.d === null || rd < b.d) age -= 1
  }

  if (age < 0 || age > 125) return null
  return age
}
