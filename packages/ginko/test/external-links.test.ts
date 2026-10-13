import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { checkFileLinks } from '../src/cli/content-links.ts'
import { collection, defineSite, externalLinks, f, type Bundle } from '../src/core/index.ts'
import { checkExternalLinks, externalCacheFile, type Fetch } from '../src/nuxt/external-links.ts'

const link = (href: string) => ['p', {}, ['a', { href }, 'x']]
const bundles = (...hrefs: string[]): Bundle[] => [{
  format: 3, site: 's', locale: 'de', locales: ['de'], mainLocale: 'de', currency: 'EUR', schemaRev: 1, contentRev: 1, generatedAt: '',
  bricks: { blog: { kind: 'collection', items: [{ id: 'blog/a', data: { slug: 'a', body: { nodes: hrefs.map(link) } }, fallback: [] }] } },
} as unknown as Bundle]

const tmp = () => mkdtempSync(join(tmpdir(), 'ginko-ext-'))
const named = (name: string) => Object.assign(new Error(name), { name })
/** A fake fetch: `script[method url]` is a status, an Error to throw, or a list of those used in order. */
function fake(script: Record<string, number | Error | (number | Error)[]>) {
  const calls: string[] = []
  const fn: Fetch = async (url, init) => {
    calls.push(`${init.method} ${url}`)
    const entry = script[`${init.method} ${url}`] ?? 200
    const next = Array.isArray(entry) ? entry.shift()! : entry
    if (next instanceof Error) throw next
    return { status: next }
  }
  return { fn, calls }
}

describe('externalLinks', () => {
  it('lists http(s) links with where they are and ignores other targets', () => {
    expect(externalLinks(bundles('https://a.example/x', '/intern', 'mailto:a@b.c', 'http://old.example'))).toEqual([
      { href: 'https://a.example/x', locale: 'de', brick: 'blog', id: 'blog/a', field: 'body' },
      { href: 'http://old.example', locale: 'de', brick: 'blog', id: 'blog/a', field: 'body' },
    ])
  })
})

describe('checkExternalLinks verdicts', () => {
  const dns = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
  it.each([
    ['404 is broken', { 'HEAD https://x.example/': 404 }, '404'],
    ['410 is broken', { 'HEAD https://x.example/': 410 }, '410'],
    ['405 on HEAD then GET 200 is ok', { 'HEAD https://x.example/': 405 }, undefined],
    ['405 on HEAD then GET 404 is broken', { 'HEAD https://x.example/': 405, 'GET https://x.example/': 404 }, '404'],
    ['403 is ignored', { 'HEAD https://x.example/': 403 }, undefined],
    ['429 is ignored', { 'HEAD https://x.example/': 429 }, undefined],
    ['500 is ignored', { 'HEAD https://x.example/': 500 }, undefined],
    ['DNS failure is broken', { 'HEAD https://x.example/': dns }, 'DNS'],
    ['timeout twice is broken', { 'HEAD https://x.example/': [named('TimeoutError'), named('TimeoutError')] }, 'timeout'],
    ['timeout once then 200 is ok', { 'HEAD https://x.example/': [named('TimeoutError'), 200] }, undefined],
    ['redirect to 200 is ok (fetch follows it)', { 'HEAD https://x.example/': 200 }, undefined],
    ['other network error is ignored', { 'HEAD https://x.example/': new TypeError('reset') }, undefined],
  ] as const)('%s', async (_name, script, reason) => {
    const { fn } = fake(script as Record<string, number | Error>)
    const issues = await checkExternalLinks(bundles('https://x.example/'), { linkCheck: { external: 'error' }, root: tmp(), log: () => {}, fetch: fn })
    expect(issues.map((i) => i.key === 'links.externalBroken' && i.params?.reason)).toEqual(reason ? [reason] : [])
  })

  it('fetches a URL once even when several links use it, and prints one summary line', async () => {
    const { fn, calls } = fake({})
    const log = vi.fn()
    await checkExternalLinks(bundles('https://x.example/', 'https://x.example/', 'https://y.example/'), { linkCheck: { external: 'warn' }, root: tmp(), log, fetch: fn })
    expect(calls.sort()).toEqual(['HEAD https://x.example/', 'HEAD https://y.example/'])
    expect(log.mock.calls).toEqual([['[ginko] external links: 2 checked, 0 from cache, 0 broken']])
  })
})

describe('cache', () => {
  it('keeps OK results for 7 days, re-checks broken ones every run', async () => {
    const root = tmp()
    let t = Date.UTC(2026, 0, 1)
    const run = async (script: Record<string, number>, hrefs: string[]) => {
      const { fn, calls } = fake(script)
      const log = vi.fn()
      const issues = await checkExternalLinks(bundles(...hrefs), { linkCheck: { external: 'error' }, root, log, fetch: fn, now: () => t })
      return { calls, issues, line: log.mock.calls[0]![0] }
    }
    expect((await run({}, ['https://ok.example/'])).calls).toHaveLength(1)
    t += 24 * 3600 * 1000
    const second = await run({}, ['https://ok.example/'])
    expect(second.calls).toEqual([])
    expect(second.line).toBe('[ginko] external links: 1 checked, 1 from cache, 0 broken')
    t += 7 * 24 * 3600 * 1000
    expect((await run({}, ['https://ok.example/'])).calls).toHaveLength(1)
    const dead = { 'HEAD https://dead.example/': 404 }
    expect((await run(dead, ['https://dead.example/'])).issues).toHaveLength(1)
    expect((await run(dead, ['https://dead.example/'])).calls).toEqual(['HEAD https://dead.example/'])
    expect(externalCacheFile(root)).toContain('node_modules/.cache/ginko/external-links.json')
  })
})

describe('without linkCheck.external', () => {
  const config = defineSite({
    site: 'linde', name: 'Linde', url: 'https://linde.example', timezone: 'Europe/Vienna', locales: ['de'], currency: 'EUR', pages: { home: '/' },
    bricks: { docs: collection({ label: 'Doku', source: 'files', max: 50, order: 'manual', route: { de: '/doku/[slug]' }, fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), body: f.markdown('Text') } }) },
  })
  const site = (links: object | undefined) => {
    const root = tmp()
    const file = join(root, 'content/docs/a.md')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '---\ntitle: A\n---\n\n[x](https://dead.example/)\n')
    return { root, config: { ...config, ...(links ? { linkCheck: links } : {}) } }
  }

  it('`ginko check` makes no request and prints no summary when the option is absent or off', async () => {
    for (const links of [undefined, { external: 'off' }, { broken: 'error' }]) {
      const { fn, calls } = fake({ 'HEAD https://dead.example/': 404 })
      const lines: string[] = []
      expect(await checkFileLinks({ ...site(links), log: (l) => lines.push(l), fetch: fn })).toBe(true)
      expect(calls).toEqual([])
      expect(lines).toEqual([])
    }
  })

  it('`ginko check` fails on a dead link when the option is `error`', async () => {
    const { fn } = fake({ 'HEAD https://dead.example/': 404 })
    const lines: string[] = []
    expect(await checkFileLinks({ ...site({ external: 'error' }), log: (l) => lines.push(l), fetch: fn })).toBe(false)
    expect(lines).toEqual(['[ginko] external links: 1 checked, 0 from cache, 1 broken', 'content/docs/a: External link https://dead.example/ is broken (404).'])
  })
})
