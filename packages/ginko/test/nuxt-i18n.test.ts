import { describe, expect, test } from 'vitest'
import { checkI18nOptions } from '../src/nuxt/i18n.ts'

// Nuxt merged nuxt.config `i18n` into Ginko's options silently: `locales: ['fr']` added a locale without
// messages or pages, and `baseUrl` or `timeZone` was ignored.
describe('checkI18nOptions', () => {
  test.each([
    [{ locales: ['fr'] }, 'i18n.locales'],
    [{ defaultLocale: 'en' }, 'i18n.defaultLocale'],
    [{ baseUrl: 'https://x.test', timeZone: 'Europe/Vienna' }, 'i18n.baseUrl, i18n.timeZone, which ginko.config.ts owns (url, timezone)'],
  ])('%j fails with %s', (options, text) => {
    expect(() => checkI18nOptions(options)).toThrow(text)
  })
  test.each([[undefined], [{}], [{ strategy: 'prefix', exclude: ['/studio'], userLocale: ['/app/**'], params: {}, seo: false }]])('%j passes', (options) => {
    expect(() => checkI18nOptions(options)).not.toThrow()
  })
})
