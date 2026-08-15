/**
 * Ages from the birth dates these registers actually publish.
 *
 * Half of them have no day: Companies House gives month and year only, on
 * purpose. So for a whole month each year the age is one of two numbers, and the
 * rule is to take the lower — without a day we cannot know the birthday has
 * happened, and ageing someone prematurely is the worse mistake.
 *
 * Only the living are asked about. The deceased keep their dates on screen, so
 * there is no age-at-death path here to test.
 */
import { describe, it, expect } from 'vitest'
import { ageFrom } from './age'

const on = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe('a full date', () => {
  it('counts a birthday that has passed', () => {
    expect(ageFrom('1971-07-14', on('2026-08-15'))).toBe(55)
  })

  it('does not count one still to come', () => {
    expect(ageFrom('1971-09-14', on('2026-08-15'))).toBe(54)
  })

  it('turns the age on the day itself', () => {
    expect(ageFrom('1971-08-15', on('2026-08-15'))).toBe(55)
    expect(ageFrom('1971-08-16', on('2026-08-15'))).toBe(54)
  })
})

describe('month and year only — what Companies House publishes', () => {
  it('counts a month already past', () => {
    expect(ageFrom('1951-03', on('2026-08-15'))).toBe(75)
  })

  it('does not count a month still to come', () => {
    expect(ageFrom('1951-11', on('2026-08-15'))).toBe(74)
  })

  it('takes the lower number during the birth month', () => {
    // They turn 75 somewhere in this month and we do not know which day. 74 is
    // the number we can stand behind; 75 would be a guess presented as a fact.
    expect(ageFrom('1951-08', on('2026-08-15'))).toBe(74)
  })
})

describe('a year alone', () => {
  it('takes the lower bound all year', () => {
    expect(ageFrom('1951', on('2026-08-15'))).toBe(74)
  })
})

describe('nothing dependable to say', () => {
  it('is null for a missing or unusable value', () => {
    for (const v of [null, undefined, '', 'unknown', 'circa 1950', '19', 'xxxx-01']) {
      expect(ageFrom(v as string, on('2026-08-15'))).toBeNull()
    }
  })

  it('is null for a date in the future', () => {
    expect(ageFrom('2030-01-01', on('2026-08-15'))).toBeNull()
  })

  it('is null for an implausible age rather than printing 400', () => {
    // These registers do contain typos, and a confident absurdity is worse than
    // a blank row.
    expect(ageFrom('1601-01-01', on('2026-08-15'))).toBeNull()
  })

  it('is null for an impossible month or day', () => {
    expect(ageFrom('1951-13', on('2026-08-15'))).toBeNull()
    expect(ageFrom('1951-01-32', on('2026-08-15'))).toBeNull()
  })
})
