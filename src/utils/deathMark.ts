/** A person who has died is marked wherever they are named — every row of
 *  the company panel, whatever the list (founder, owner, officer, group
 *  member), and their box in the graph. One rule, so a dead founder never
 *  reads like a living one. Year only, as the timelines show dates: the full
 *  day is on the person's own panel. */
export function deathYear(person: { death_date?: string | null } | null | undefined): string | null {
  const d = person?.death_date
  return d && /^\d{4}/.test(d) ? d.slice(0, 4) : null
}

/** "† 2018", or null for a living person (or one whose death is not recorded). */
export function deathMark(person: { death_date?: string | null } | null | undefined): string | null {
  const year = deathYear(person)
  return year ? `\u2020 ${year}` : null
}

/** A person's box label: the name, and the mark on its own line. */
export function personBoxLabel(name: string, person: { death_date?: string | null } | null | undefined): string {
  const mark = deathMark(person)
  return mark ? `${name}\n${mark}` : name
}
