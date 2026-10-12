import { describe, expect, test } from 'vitest'
import { normalizeHref } from '../src/core/index.ts'

describe('normalizeHref', () => {
  test.each([
    ['www.lupinum.com', 'https://www.lupinum.com'],
    ['lupinum.com/kontakt?x=1', 'https://lupinum.com/kontakt?x=1'],
    ['info@lupinum.com', 'mailto:info@lupinum.com'],
    ['tel:+41 44 123 45 67', 'tel:+41441234567'],
    ['https://lupinum.com', 'https://lupinum.com'],
    ['/preise', '/preise'],
    ['  #kontakt ', '#kontakt'],
  ])('%j becomes %j', (typed, href) => {
    expect(normalizeHref(typed)).toBe(href)
  })
})
