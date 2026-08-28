/**
 * The published notice has to keep matching the code.
 *
 * A privacy notice is the one artefact in the repo that can be falsified by a
 * change somewhere else entirely, silently, with every test still green. It
 * already happened once here: the pages were written when the app counted
 * nothing and said so — "No analytics, no tracking pixels" — and then usage
 * measurement shipped and went live, leaving a promise on the page that the
 * running code contradicted.
 *
 * These tests do not check prose. They tie a claim to the fact that decides it:
 * if `reportEvent` exists in the client, the notice must describe measurement,
 * and the store declarations must not answer "No" to app activity. If
 * measurement is ever removed, they fail the other way and the notice gets
 * simplified back — which is the correct outcome, not a nuisance.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf-8')

const api = read('src/services/api.ts')
const privacyEn = read('public/legal/privacy.html')
const privacyDe = read('public/legal/privacy.de.html')
const storeAnswers = read('docs/store-privacy-answers.md')

/** Does the app report usage to the server at all? Everything below follows. */
const measures = /reportEvent/.test(api) && /analytics\/event/.test(api)

describe('what the privacy notice claims about measurement', () => {
  it('is a question the code answers', () => {
    // The premise. If this ever flips, the rest of this file is telling you the
    // notice needs rewriting, not that a test is broken.
    expect(measures).toBe(true)
  })

  for (const [lang, page] of [['English', privacyEn], ['German', privacyDe]] as const) {
    it(`does not promise, in ${lang}, that nothing is counted`, () => {
      // Scoped to the "what we do not collect" paragraph, which is where the
      // promise lived. Searching the whole page for "no analytics" also hits
      // "no analytics company is involved" — a true sentence, and one worth
      // keeping, since what people actually fear is a third party receiving it.
      const claim = /(deliberately do not collect|bewusst nicht erheben)[^]*?<\/p>/.exec(page)
      expect(claim, 'the "what we do not collect" paragraph moved or vanished').not.toBeNull()
      expect(claim![0]).not.toMatch(/analytics|Analyse-Tools/i)
    })

    it(`says what is counted, in ${lang}`, () => {
      // Removing the false claim is not enough — silence about it is its own
      // kind of wrong when the counting is happening.
      expect(page).toMatch(lang === 'German' ? /Zählen, ohne zu beobachten/ : /Counting, without watching/)
    })

    it(`admits the one place a name can be stored, in ${lang}`, () => {
      // The residual risk the record of processing insists on stating: the
      // query column is free text and somebody will search for a person.
      expect(page).toMatch(lang === 'German' ? /Personennamen/ : /person's name/)
    })

    it(`gives the counters a retention period, in ${lang}`, () => {
      expect(page).toMatch(lang === 'German' ? /12 Monate/ : /12 months/)
    })
  }
})

describe('what the app stores declare', () => {
  it('declares the two app-activity types we do collect', () => {
    // Declaring these is a deliberate choice — Play's aggregation exclusion
    // arguably covers us — and the reasoning is written beside them.
    //
    // Asserted per type, not "no App activity row says No": the row for
    // installed apps and user-generated content says No and should, so a blanket
    // check would forbid a true answer.
    expect(storeAnswers).toMatch(/App activity → \*\*In-app search history\*\*[^|]*\|\s*\*\*Yes\*\*/)
    expect(storeAnswers).toMatch(/App activity → \*\*App interactions\*\*[^|]*\|\s*\*\*Yes\*\*/)
  })

  it('declares the same thing to Apple, as not linked to you', () => {
    // "Not linked" is accurate — there is no identifier on the row to link it
    // to — but it must appear, not be omitted as "not collected".
    expect(storeAnswers).toMatch(/\*\*Data not linked to you:\*\*\s*\n\s*\n\| Category/)
    expect(storeAnswers).toMatch(/Product Interaction/)
  })

  it('no longer lists usage data among what is not collected', () => {
    const notCollected = /Everything else — ([^]*?) — is \*\*not collected\*\*/.exec(storeAnswers)
    expect(notCollected, 'the "everything else" sentence moved or vanished').not.toBeNull()
    expect(notCollected![1]).not.toMatch(/Usage Data/)
    expect(notCollected![1]).not.toMatch(/Search History/)
  })

  it('still says no third-party analytics SDK, which remains true', () => {
    // First-party counting into our own database is not an SDK, and the
    // distinction is one an app reviewer will check.
    expect(storeAnswers).toMatch(/no analytics SDK|third-party analytics SDKs/i)
  })
})

describe('what the notice says about a birth date', () => {
  it('does not claim the date is never shown', () => {
    // It was true until the timeline started marking the year of birth.
    expect(privacyEn).not.toMatch(/We do not display it\./)
    expect(privacyDe).not.toMatch(/Angezeigt wird es nicht\./)
  })

  it('says the year is published and the day and month are not', () => {
    expect(privacyEn).toMatch(/day and month[^]*?stay unpublished/)
    expect(privacyDe).toMatch(/Tag und Monat[^]*?bleiben unveröffentlicht/)
  })
})
