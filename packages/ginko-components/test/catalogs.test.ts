// The components' UI texts: every language has the same keys and the same ICU parameters.
import { compileTree } from '@lupinum/ginko-i18n/compile'
import { describe, expect, it } from 'vitest'
import ar from '../i18n/ar.json'
import de from '../i18n/de.json'
import en from '../i18n/en.json'
import fr from '../i18n/fr.json'
import it_ from '../i18n/it.json'

describe('catalogs', () => {
  // Wrong behaviour caught: a key or parameter exists in one language only, so a reader sees a missing text or an empty gap.
  it.each([['en', en], ['fr', fr], ['it', it_], ['ar', ar]])('%s has the keys and ICU parameters of German', (_locale, raw) => {
    const base = compileTree(de).params
    expect(Object.keys(base).length).toBeGreaterThan(30)
    const params = compileTree(raw).params
    expect(Object.keys(params).sort()).toEqual(Object.keys(base).sort())
    for (const [key, names] of Object.entries(base)) expect([...(params[key] ?? [])].sort(), key).toEqual([...names].sort())
  })
})
