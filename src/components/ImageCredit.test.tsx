import { describe, expect, it } from 'vitest'
import { creditParts } from './ImageCredit'

const credit = (over: Record<string, unknown> = {}) => ({
  url: '/media/entity/e1/file', author: 'Jane Doe', license: 'CC BY-SA 4.0',
  license_url: 'https://creativecommons.org/licenses/by-sa/4.0',
  file_page: 'https://commons.wikimedia.org/wiki/File:Acme.svg',
  attribution_required: true, source: 'Wikimedia Commons', ...over,
})

describe('creditParts', () => {
  it('names the author, the licence and the source, each linked where it is explained', () => {
    expect(creditParts(credit())).toEqual([
      { text: 'Jane Doe', href: 'https://commons.wikimedia.org/wiki/File:Acme.svg' },
      { text: 'CC BY-SA 4.0', href: 'https://creativecommons.org/licenses/by-sa/4.0' },
      { text: 'Wikimedia Commons', href: 'https://commons.wikimedia.org/wiki/File:Acme.svg' },
    ])
  })

  it('leaves out an author nobody named and links a licence without text to the file', () => {
    expect(creditParts(credit({ author: null, license: 'Public domain', license_url: null }))).toEqual([
      { text: 'Public domain', href: 'https://commons.wikimedia.org/wiki/File:Acme.svg' },
      { text: 'Wikimedia Commons', href: 'https://commons.wikimedia.org/wiki/File:Acme.svg' },
    ])
  })
})
