import { useTranslation } from 'react-i18next'
import type { ReadFrom } from '../types'

/**
 * How surely WE read a fact — the second trust cue on a relationship row.
 *
 * The corroboration badge says who speaks (a register, a wiki, several
 * sources at once). This one says something else: how much of the value is
 * the parser's own doing. A GLEIF field, an Exhibit 21 cell under a header
 * the filer wrote, a figure in a numbered row of an SEC form — readings
 * nobody had to interpret. A parent inferred from an indentation, a header
 * carried onto the next page, a subsidiary list written as lines of text, a
 * departure picked out of an announcement's sentence — those are readings,
 * and a reader checking the filing deserves to know which rows to check first.
 *
 * The grade is NOT the source's worth: a narrative reading of an SEC filing
 * still rests on a statutory filing. It is a statement about the reading only.
 *
 * Same rule as the corroboration badge: the normal case stays silent.
 * `field`, `table` and `form` render nothing — badging them would turn every
 * row into noise. `layout`, `prose` and `narrative` get a small chip, each
 * with its own hint on hover, warmer the weaker the reading. Unknown (null,
 * undefined — manual entries, data from before the grade) renders nothing
 * too: we do not know, and a chip would claim we do. Every value, the silent
 * ones included, is still listed in the row's menu.
 */

/** The grades worth a mark, weakest last. */
export type MarkedGrade = 'layout' | 'prose' | 'narrative'

/** Exported so the sources list can apply the same test to its rows without
 *  rendering through this component. */
export function readingGrade(readFrom?: ReadFrom | null): MarkedGrade | null {
  if (readFrom === 'layout' || readFrom === 'prose' || readFrom === 'narrative') return readFrom
  return null
}

export default function ReadingBadge({ rel }: {
  rel?: { read_from?: ReadFrom | null } | null
}) {
  const { t } = useTranslation()
  const grade = readingGrade(rel?.read_from)
  if (!grade) return null
  return (
    <span className={`reading-badge reading-badge--${grade}`}
          title={t(`trust.readFromHint.${grade}`)}>
      {t(`trust.readFrom.${grade}`)}
    </span>
  )
}
