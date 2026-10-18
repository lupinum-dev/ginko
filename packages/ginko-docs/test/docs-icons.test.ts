import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { iconNames, readIcon } from '../modules/icons'

const customDir = fileURLToPath(new URL('../icons', import.meta.url))
const roots = [fileURLToPath(new URL('..', import.meta.url))]

describe('iconNames', () => {
  it('finds the names a site writes in front matter, Markdown components and app.config, and skips types', () => {
    expect(iconNames('icon: lucide:key-round\n  - icon: book-open\n::card{icon="tabler:home" title="x"}', false))
      .toEqual(['lucide:key-round', 'lucide:book-open', 'tabler:home'])
    expect(iconNames("social: [{ icon: 'docs:github', href: 'x' }]\nicon: string,\nicon?: string", true)).toEqual(['docs:github'])
  })
})

describe('readIcon', () => {
  it('reads an installed set and the docs brand logos; an unknown name gives nothing', () => {
    expect(readIcon('lucide:x', roots, customDir)?.[1]).toBe('0 0 24 24')
    expect(readIcon('docs:github', roots, customDir)?.[0]).toContain('<path')
    expect(readIcon('lucide:no-such-icon', roots, customDir)).toBeUndefined()
    expect(readIcon('nosuchset:x', roots, customDir)).toBeUndefined()
  })
})
