/** A person who has died is marked wherever they are named — every row of
 *  the company panel, whatever the list (founder, owner, officer, group
 *  member), and their box in the graph. One rule, so a dead founder never
 *  reads like a living one. Year only, as the timelines show dates: the full
 *  day is on the person's own panel. A dissolved company carries the same
 *  mark, for the same reason: `dissolved_on` is the day it ceased to exist. */
function yearOf(date: string | null | undefined): string | null {
  return date && /^\d{4}/.test(date) ? date.slice(0, 4) : null
}

/** "† 2018": the mark for a recorded end, or null when none is recorded. */
export function endMark(date: string | null | undefined): string | null {
  const year = yearOf(date)
  return year ? `\u2020 ${year}` : null
}

export function deathYear(person: { death_date?: string | null } | null | undefined): string | null {
  return yearOf(person?.death_date)
}

/** "† 2018", or null for a living person (or one whose death is not recorded). */
export function deathMark(person: { death_date?: string | null } | null | undefined): string | null {
  return endMark(person?.death_date)
}

/** "† 2023", or null for a company still in existence (or whose end no source states). */
export function dissolutionMark(entity: { dissolved_on?: string | null } | null | undefined): string | null {
  return endMark(entity?.dissolved_on)
}

/** A person's box label: the name, and the mark on its own line. */
export function personBoxLabel(name: string, person: { death_date?: string | null } | null | undefined): string {
  const mark = deathMark(person)
  return mark ? `${name}\n${mark}` : name
}

/** A company's box label, the same way. */
export function entityBoxLabel(name: string, entity: { dissolved_on?: string | null } | null | undefined): string {
  const mark = dissolutionMark(entity)
  return mark ? `${name}\n${mark}` : name
}
