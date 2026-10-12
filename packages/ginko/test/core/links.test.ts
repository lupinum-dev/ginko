import { describe, expect, it } from 'vitest'
import { checkLinks, isSafeHref, linkTargets, resolveRouteLinks, type Bundle, type BundleItem, type Fields, type Schema } from '../../src/core/index.ts'

describe('linkTargets', () => {
  const fields = {
    body: { type: 'markdown' },
    title: { type: 'text' },
    rows: { type: 'list', of: { note: { type: 'markdown' } } },
  } as unknown as Fields

  it('collects inline links, definitions and snippets from every language and list row, and ignores other fields', () => {
    const targets = linkTargets(fields, {
      body: { de: 'Siehe [Karte]($page.menu#top) und [Blog](<$blog.hallo>).\n\n[ref]: /impressum "Titel"\n\n::snippet{name="hours"}', en: '[Home](/en)' },
      title: { de: '[nicht](/markdown)' },
      rows: [{ note: { de: '[Zeile]($page.nope)' } }],
    })
    expect([...targets].sort()).toEqual(['$blog.hallo', '$page.menu#top', '$page.nope', '/en', '/impressum', 'snippet:hours'])
  })
})

const schema = {
  pages: { menu: { de: '/speisekarte', en: '/en/menu' } },
  bricks: { blog: { kind: 'collection' }, snippets: { kind: 'collection' } },
} as unknown as Pick<Schema, 'pages' | 'bricks'>

const tree = (...nodes: unknown[]) => ({ nodes })
const link = (href: string) => ['p', {}, ['a', { href }, 'x']]
const item = (id: string, data: Record<string, unknown>, url?: string): BundleItem => ({ id, data, fallback: [], ...(url ? { urls: { de: url } } : {}) })
const bundle = (blog: BundleItem[], snippets: BundleItem[] = []): Bundle => ({
  format: 3, site: 's', locale: 'de', locales: ['de'], mainLocale: 'de', currency: 'EUR', schemaRev: 1, contentRev: 1, generatedAt: '',
  bricks: { blog: { kind: 'collection', items: blog }, snippets: { kind: 'collection', items: snippets } },
} as unknown as Bundle)
const post = item('blog/hallo', { slug: 'hallo', title: 'Hallo', body: tree(['h2', { id: 'start' }, 'Start']) }, '/blog/hallo')
const withText = (...nodes: unknown[]) => bundle([post, item('blog/other', { slug: 'other', body: tree(...nodes) }, '/blog/other')])
const textOf = (b: Bundle) => (b.bricks.blog as { items: BundleItem[] }).items[1]!.data.body as { nodes: any[] }

describe('resolveRouteLinks', () => {
  it.each([
    ['page link', '$page.menu', '/speisekarte', undefined],
    ['entry by slug', '$blog.hallo', '/blog/hallo', undefined],
    ['entry by id', '$blog.blog/hallo', '/blog/hallo', undefined],
    ['anchor kept', '$blog.hallo#start', '/blog/hallo#start', undefined],
    ['unknown entry', '$blog.nope', '$blog.nope', true],
    ['unknown page', '$page.nope', '$page.nope', true],
    ['unknown brick', '$news.x', '$news.x', true],
  ])('%s', (_name, href, expected, broken) => {
    const props = textOf(resolveRouteLinks(withText(link(href)), schema)).nodes[0][2][1]
    expect(props.href).toBe(expected)
    expect(props['data-broken']).toBe(broken)
  })

  it('does not mutate the input', () => {
    const input = withText(link('$page.menu'))
    resolveRouteLinks(input, schema)
    expect(textOf(input).nodes[0]).toEqual(link('$page.menu'))
  })

  it('replaces a snippet by the body of snippets/<name>, one level deep', () => {
    const snip = item('snippets/opening-note', { body: tree(['p', {}, 'Offen'], ['snippet', { name: 'opening-note' }]) })
    const out = textOf(resolveRouteLinks(bundle([post, item('blog/other', { body: tree(['snippet', { name: 'opening-note' }]) }, '/blog/other')], [snip]), schema))
    expect(out.nodes).toEqual([['p', {}, 'Offen'], ['snippet', { name: 'opening-note' }]])
  })

  it('marks a missing snippet', () => {
    const out = textOf(resolveRouteLinks(withText(['snippet', { name: 'gone' }]), schema))
    expect(out.nodes).toEqual([['snippet', { name: 'gone', 'data-broken': true }]])
  })
})

describe('checkLinks', () => {
  const run = (nodes: unknown[], options = {}, extra = {}) => checkLinks([resolveRouteLinks(withText(...nodes), schema)], { ...schema, ...extra }, options)

  it('reports a broken route link as error', () => {
    expect(run([link('$blog.nope')])).toMatchObject([{ severity: 'error', brick: 'blog', id: 'blog/other', href: '$blog.nope' }])
  })
  it('reports a broken snippet as error', () => {
    expect(run([['snippet', { name: 'gone' }]])).toMatchObject([{ severity: 'error', href: 'snippet:gone' }])
  })
  it('reports an unknown path only when files is given', () => {
    expect(run([link('/nirgends')])).toEqual([])
    expect(run([link('/nirgends')], { files: () => false })).toMatchObject([{ severity: 'error', href: '/nirgends' }])
    expect(run([link('/media/a.pdf'), link('/speisekarte'), link('/blog/hallo')], { files: (p: string) => p === '/media/a.pdf' })).toEqual([])
  })
  it('warns about a missing anchor, not about an existing one', () => {
    expect(run([link('$blog.hallo#start'), link('$blog.hallo#weg')])).toMatchObject([{ severity: 'warn', href: '/blog/hallo#weg' }])
  })
  it.each([
    [{ broken: 'off' }, 0],
    [{ broken: 'warn' }, 1],
    [{ anchors: 'off' }, 0],
    [{ anchors: 'error' }, 1],
  ] as const)('config %j maps severities', (links, count) => {
    const nodes = 'broken' in links ? [link('$blog.nope')] : [link('$blog.hallo#weg')]
    const issues = run(nodes, {}, { links })
    expect(issues).toHaveLength(count)
    if (count) expect(issues[0]!.severity).toBe('broken' in links ? 'warn' : 'error')
  })
  it('leaves a link to a brick this bundle does not carry (platform brick in a file bundle) unjudged', () => {
    const mixed = { ...schema, bricks: { ...schema.bricks, news: { kind: 'collection' } } } as unknown as typeof schema
    const b = resolveRouteLinks(withText(link('$news.x')), mixed)
    expect(checkLinks([b], mixed)).toEqual([])
    expect(checkLinks([resolveRouteLinks(withText(link('$nope.x')), mixed)], mixed)).toHaveLength(1)
  })
  // Wrong behaviour caught: a link to an old URL goes unnoticed, the level is ignored, or an entry's redirectFrom is not considered.
  it.each([
    ['config rule', [{ from: '/alt', to: '/blog/hallo' }], undefined, 'warn'],
    ['entry redirectFrom', [], undefined, 'warn'],
    ['level error', [{ from: '/alt', to: '/blog/hallo' }], { redirected: 'error' as const }, 'error'],
    ['level off', [{ from: '/alt', to: '/blog/hallo' }], { redirected: 'off' as const }, undefined],
  ])('link to a redirected path: %s', (name, redirects, links, severity) => {
    const target = name === 'entry redirectFrom' ? item('blog/hallo', { slug: 'hallo', redirectFrom: ['/alt'] }, '/blog/hallo') : post
    const b = bundle([target, item('blog/other', { slug: 'other', body: tree(link('/alt?x=1')) }, '/blog/other')])
    const issues = checkLinks([b], schema, { redirects, links })
    expect(issues.map((i) => [i.severity, i.message])).toEqual(severity ? [[severity, 'Link /alt?x=1 führt über eine Weiterleitung zu /blog/hallo.']] : [])
  })
  it('ignores external links', () => {
    expect(run([link('https://example.com/x')], { files: () => false })).toEqual([])
  })
})

it.each([
  ['$blog.my-post', true], ['$page.menu#preise', true], ['$', false], ['$a b', false], ['$a/../b', false],
])('isSafeHref(%j) accepts route links', (href, ok) => {
  expect(isSafeHref(href)).toBe(ok)
})
