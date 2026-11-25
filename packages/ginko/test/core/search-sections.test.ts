// The whitespace of a search record's text (search-sections.ts): what the excerpts and the index read.
import { describe, expect, it } from 'vitest'
import { collapse } from '../../src/core/search-sections.ts'

describe('collapse', () => {
  // Wrong behaviour caught: the line-by-line rewrite without a regex (K2) kept empty lines, kept spaces at a line
  // break, or dropped a carriage return or no-break space that is no space or tab.
  it.each([
    ['  a \t b  ', 'a b'],
    ['a  \n\n \t\n  b', 'a\nb'],
    ['a \r\n b', 'a \r\nb'],
    ['a  \nb', 'a \nb'],
    [' \n\t\n ', ''],
    ['x\n \n', 'x'],
  ])('%j is %j', (text, expected) => {
    expect(collapse(text)).toBe(expected)
  })
})
