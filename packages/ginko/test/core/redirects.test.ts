import { describe, expect, it } from 'vitest'
import { buildBundle, collection, defineSite, entryRedirects, f, findRedirect, matchRedirect, redirectProblems, serializeSchema, type Bundle, type Redirect } from '../../src/core/index.ts'

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

// Wrong behaviour caught: a splat that starts with a second slash or backslash turns the path into a scheme-relative URL to another host.
describe('matchRedirect keeps path targets on the site', () => {
  const rules: Redirect[] = [{ from: '/blog/*', to: '/:splat' }]
  it.each([
    ['/blog//evil.example', '/evil.example'],
    ['/blog/%2F%2Fevil.example', '/%2F%2Fevil.example'],
    ['/blog/\\evil.example', '/evil.example'],
    ['/blog///\\/evil.example?x=1', '/evil.example?x=1'],
    ['/blog/post', '/post'],
  ])('%s', (path, to) => {
    expect(matchRedirect(rules, path)).toEqual({ to, status: 301 })
  })
  it('leaves a full URL written in the rule alone', () => {
    expect(matchRedirect([{ from: '/a', to: 'https://example.com/x' }], '/a')).toEqual({ to: 'https://example.com/x', status: 301 })
  })
})

// Wrong behaviour caught: every request compiles all rules again (3 ms per 2000 rules, on each page view).
describe('compiled rules are reused', () => {
  it('reads a rule list once, and the entry rules of a bundle once', () => {
    let reads = 0
    const rules: Redirect[] = [{ get from() { reads++; return '/a' }, to: '/b' }]
    expect(matchRedirect(rules, '/a')).toEqual({ to: '/b', status: 301 })
    const afterFirst = reads
    expect(afterFirst).toBeGreaterThan(0)
    expect(matchRedirect(rules, '/a')).toEqual({ to: '/b', status: 301 })
    expect(reads).toBe(afterFirst)

    let entryReads = 0
    const bundle = { bricks: { news: { kind: 'collection', get items() { entryReads++; return [{ id: 'n/a', data: {}, fallback: [], urls: { de: '/neu' }, oldUrls: { de: ['/alt'] } }] } } }, locale: 'de' } as unknown as Bundle
    expect(findRedirect([], bundle, '/alt')).toEqual({ to: '/neu', status: 301 })
    expect(findRedirect([], bundle, '/alt')).toEqual({ to: '/neu', status: 301 })
    expect(entryReads).toBe(1)
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
          { id: 'b', data: {}, fallback: [], urls: { de: '/aktuell/b' }, oldUrls: { de: ['/alt-b', '/alt-b2'] } },
          { id: 'c', data: {}, fallback: [], urls: { en: '/news/c' }, oldUrls: { de: ['/alt-c'] } },
          { id: 'd', data: {}, fallback: [], urls: { de: '/aktuell/d-neu' }, oldUrls: { de: ['/aktuell/d'], en: ['/news/d'] } },
        ],
      },
    },
  }

  // Wrong behaviour caught: a renamed page's old addresses (`oldUrls`) give a 404, another locale's old address
  // redirects in this one, or an item without a URL in the bundle locale produces a rule to nowhere.
  it('creates 301 rules from the locale\'s oldUrls to the locale URL and skips items without one', () => {
    expect(entryRedirects(bundle)).toEqual([
      { from: '/alt-b', to: '/aktuell/b', status: 301 },
      { from: '/alt-b2', to: '/aktuell/b', status: 301 },
      { from: '/aktuell/d', to: '/aktuell/d-neu', status: 301 },
    ])
  })

  // Wrong behaviour caught: a file entry's `$redirectFrom` is lost between the read result and the bundle, or forwards
  // only in the main language, so the old path answers 404 on the English site.
  it('forwards a file entry\'s $redirectFrom to its page in every language', () => {
    const schema = serializeSchema(defineSite({
      site: 'news', name: 'News', url: 'https://news.example', timeZone: 'Europe/Vienna', locales: ['de', 'en'], currency: 'EUR',
      week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }, pages: { home: { de: '/', en: '/en' } },
      bricks: { news: collection({ listing: { title: 'title' }, label: 'News', source: 'files', max: 50, order: 'manual', route: { de: '/aktuell/[slug]', en: '/en/news/[slug]' }, fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }) } }) },
    }))
    const entries = { news: [{ id: 'news/a', data: { title: { de: 'A', en: 'A' }, slug: { de: 'a', en: 'a' } }, redirectFrom: ['/alt-a'] }] }
    const rules = (locale: string) => entryRedirects(buildBundle({ schema, requestedLocale: locale, entries, files: () => undefined, schemaRev: 1, contentRev: 1, generatedAt: '2026-10-11T00:00:00Z', today: '2026-10-11' }))
    expect([rules('de'), rules('en')]).toEqual([[{ from: '/alt-a', to: '/aktuell/a', status: 301 }], [{ from: '/alt-a', to: '/en/news/a', status: 301 }]])
  })
})

describe('redirectProblems', () => {
  // Wrong behaviour caught: invalid rules pass the config check unnoticed, or a valid rule is reported.
  it.each([
    ['valid', [{ from: '/a', to: '/b' }], []],
    ['from without slash', [{ from: 'a', to: '/b' }], ['"a": path must start with "/".']],
    ['redirect to itself', [{ from: '/a', to: '/a/' }], ['"/a": redirect points to itself.']],
    ['to starts with a parameter', [{ from: '/blog/*', to: '/:splat' }], ['"/blog/*": "to" starts with a parameter (/:splat). Start it with a fixed path such as "/new/:splat" so a visitor cannot choose the target host.']],
    ['duplicate from', [{ from: '/a', to: '/b' }, { from: '/a', to: '/c' }], ['"/a": defined more than once.']],
  ])('%s', (_name, rules, expected) => {
    expect(redirectProblems(rules)).toEqual(expected)
  })
})

describe('findRedirect', () => {
  const entries = { bricks: { news: { kind: 'collection', items: [{ id: 'news/a', data: {}, fallback: [], urls: { de: '/aktuell/a' }, oldUrls: { de: ['/alt'] } }] } }, locale: 'de' } as unknown as Bundle
  // Wrong behaviour caught: an entry rule overrides the site config, or the entry rules are not consulted.
  it('prefers a config rule over an entry rule and falls back to the entry rule', () => {
    expect(findRedirect([{ from: '/alt', to: '/config' }], entries, '/alt')).toEqual({ to: '/config', status: 301 })
    expect(findRedirect([], entries, '/alt')).toEqual({ to: '/aktuell/a', status: 301 })
    expect(findRedirect([], undefined, '/alt')).toBeUndefined()
  })

  // Wrong behaviour caught: `/\/+$/` on the request path took 0.4 s for 16,000 slashes and seconds for more, so a few
  // such requests kept a site's server busy (every request passes the redirect middleware).
  it('matches a request path of many slashes at once', () => {
    const start = performance.now()
    expect(findRedirect([{ from: '/alt', to: '/neu' }], undefined, `${'/'.repeat(100_000)}x`)).toBeUndefined()
    expect(performance.now() - start).toBeLessThan(500)
  })
})

