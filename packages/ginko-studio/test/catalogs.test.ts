// The Studio catalogs: every language has the same keys and the same ICU parameters.
import { compileTree } from '@lupinum/ginko-i18n/compile'
import { describe, expect, it } from 'vitest'
import de from '../i18n/de.json'
import en from '../i18n/en.json'
import es from '../i18n/es.json'

describe('catalogs', () => {
  // Wrong behaviour caught: a key or parameter exists in one language only, so a person sees an empty gap or a missing text.
  it.each([['en', en], ['es', es]])('%s has the keys and ICU parameters of German', (_locale, raw) => {
    const base = compileTree(de).params
    expect(Object.keys(base).length).toBeGreaterThan(300)
    const params = compileTree(raw).params
    expect(Object.keys(params).sort()).toEqual(Object.keys(base).sort())
    for (const [key, names] of Object.entries(base)) expect([...(params[key] ?? [])].sort(), key).toEqual([...names].sort())
  })
})
