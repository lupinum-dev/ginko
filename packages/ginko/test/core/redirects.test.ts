import { describe, expect, it } from 'vitest'
import { entryRedirects, findRedirect, matchRedirect, redirectProblems, type Bundle, type Redirect } from '../../src/core/index.ts'

describe('matchRedirect', () => {
  const rules: Redirect[] = [
    { from: '/alt', to: '/neu' },
    { from: '/blog/:slug', to: '/artikel/:slug' },
    { from: '/old/*', to: '/new/:splat' },
    { from: '/gone', to: 'https://example.com/x', status: 302 },
  ]
  // Wrong behaviour caught: a rule matches the wrong path, drops the captured segment or splat, loses the query, or ignores the status.
  it.each([
    ['/alt', { to: '/neu', status: 301 }],
    ['/alt/', { to: '/neu', status: 301 }],
    ['/alt?utm=1', { to: '/neu?utm=1', status: 301 }],
    ['/blog/hallo', { to: '/artikel/hallo', status: 301 }],
    ['/blog/a/b', undefined],
    ['/old/a/b', { to: '/new/a/b', status: 301 }],
    ['/old', { to: '/new/', status: 301 }],
    ['/ALT', undefined],
    ['/nirgendwo', undefined],
    ['/gone?x=2', { to: 'https://example.com/x?x=2', status: 302 }],
  ])('%s', (path, expected) => {
    expect(matchRedirect(rules, path)).toEqual(expected)
  })

  // Wrong behaviour caught: a later, broader rule overrides an earlier one.
  it('uses the first matching rule', () => {
    expect(matchRedirect([{ from: '/a/:x', to: '/first' }, { from: '/a/*', to: '/second' }], '/a/1')).toEqual({ to: '/first', status: 301 })
  })

  // Wrong behaviour caught: the query is appended to a `to` that already has a query string with a second `?`.
  it('joins the query with & when the target already has one', () => {
    expect(matchRedirect([{ from: '/a', to: '/b?lang=de' }], '/a?x=1')).toEqual({ to: '/b?lang=de&x=1', status: 301 })
  })
})

describe('entryRedirects', () => {
  const bundle: Bundle = {
    format: 3,
    site: 'test',
    locale: 'de',
    locales: ['de', 'en'],
    mainLocale: 'de',
    currency: 'EUR',
    schemaRev: 1,
    contentRev: 1,
    generatedAt: '2026-10-11T00:00:00Z',
    bricks: {
      news: {
        kind: 'collection',
        items: [
          { id: 'a', data: { redirectFrom: '/alt-a' }, fallback: [], urls: { de: '/aktuell/a', en: '/news/a' } },
          { id: 'b', data: { redirectFrom: ['/alt-b', '/alt-b2'] }, fallback: [], urls: { de: '/aktuell/b' } },
          { id: 'c', data: { redirectFrom: '/alt-c' }, fallback: [], urls: { en: '/news/c' } },
        ],
      },
      hero: { kind: 'single', data: { redirectFrom: '/nicht-relevant' }, fallback: [] },
    },
  }

  // Wrong behaviour caught: string and array `redirectFrom` are not both turned into rules, items without a URL in the bundle locale produce a rule to nowhere, or single bricks produce rules.
  it('creates 301 rules from string and array redirectFrom to the locale URL and skips items without one', () => {
    expect(entryRedirects(bundle)).toEqual([
      { from: '/alt-a', to: '/aktuell/a', status: 301 },
      { from: '/alt-b', to: '/aktuell/b', status: 301 },
      { from: '/alt-b2', to: '/aktuell/b', status: 301 },
    ])
  })
})

describe('redirectProblems', () => {
  // Wrong behaviour caught: invalid rules pass the config check unnoticed, or a valid rule is reported.
  it.each([
    ['valid', [{ from: '/a', to: '/b' }], []],
    ['from without slash', [{ from: 'a', to: '/b' }], ['"a": path must start with "/".']],
    ['redirect to itself', [{ from: '/a', to: '/a/' }], ['"/a": redirect points to itself.']],
    ['duplicate from', [{ from: '/a', to: '/b' }, { from: '/a', to: '/c' }], ['"/a": defined more than once.']],
  ])('%s', (_name, rules, expected) => {
    expect(redirectProblems(rules)).toEqual(expected)
  })
})

describe('findRedirect', () => {
  const entries = { bricks: { news: { kind: 'collection', items: [{ id: 'news/a', data: { redirectFrom: '/alt' }, fallback: [], urls: { de: '/aktuell/a' } }] } }, locale: 'de' } as unknown as Bundle
  // Wrong behaviour caught: an entry rule overrides the site config, or the entry rules are not consulted.
  it('prefers a config rule over an entry rule and falls back to the entry rule', () => {
    expect(findRedirect([{ from: '/alt', to: '/config' }], entries, '/alt')).toEqual({ to: '/config', status: 301 })
    expect(findRedirect([], entries, '/alt')).toEqual({ to: '/aktuell/a', status: 301 })
    expect(findRedirect([], undefined, '/alt')).toBeUndefined()
  })
})
