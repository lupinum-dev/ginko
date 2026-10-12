import { describe, expect, it } from 'vitest'
import { breadcrumbs, navTree, type Bundle, type BundleItem, type NavNode } from '../../src/core/index.ts'

const doc = (id: string, de: string | undefined, data: Record<string, unknown> = {}): BundleItem => ({ id, data, fallback: [], ...(de ? { urls: { de, en: `/en${de}` } } : {}) })
const bundle = (bricks: Record<string, BundleItem[]>): Bundle => ({
  format: 3, site: 's', locale: 'de', locales: ['de', 'en'], mainLocale: 'de', currency: 'EUR', schemaRev: 1, contentRev: 1, generatedAt: '',
  bricks: Object.fromEntries(Object.entries(bricks).map(([k, items]) => [k, { kind: 'collection' as const, items }])),
})
const shape = (nodes: NavNode[]): unknown[] => nodes.map((n) => (n.children.length ? { [n.path]: shape(n.children) } : n.path))

describe('navTree', () => {
  it('nests by path prefix, keeps item order and titles', () => {
    const b = bundle({ docs: [doc('b', '/docs/a/b', { title: 'B' }), doc('root', '/docs', { title: 'Docs' }), doc('a', '/docs/a'), doc('c', '/docs/c')] })
    const tree = navTree(b, ['docs'], 'de')
    expect(shape(tree)).toEqual([{ '/docs': [{ '/docs/a': ['/docs/a/b'] }, '/docs/c'] }])
    expect(tree[0]!.title).toBe('Docs')
    expect(tree[0]!.children[0]).toMatchObject({ title: 'a', id: 'a', brick: 'docs' })
  })

  it('attaches an orphan to the nearest existing ancestor, else the root', () => {
    const b = bundle({ docs: [doc('top', '/docs'), doc('deep', '/docs/x/y/z'), doc('far', '/other/page')] })
    expect(shape(navTree(b, ['docs'], 'de'))).toEqual([{ '/docs': ['/docs/x/y/z'] }, '/other/page'])
  })

  it('uses the locale urls, skips items without one, merges bricks in the given order', () => {
    const b = bundle({ pages: [doc('p', '/seite')], docs: [doc('d', '/seite/doku'), doc('hidden', undefined)] })
    expect(shape(navTree(b, ['pages', 'docs'], 'de'))).toEqual([{ '/seite': ['/seite/doku'] }])
    expect(shape(navTree(b, ['docs', 'pages'], 'en'))).toEqual([{ '/en/seite': ['/en/seite/doku'] }])
  })

  it('lets a parent ref override the URL rule and ignores cycles', () => {
    const b = bundle({ docs: [doc('a', '/a'), doc('b', '/a/b', { parent: 'c' }), doc('c', '/c', { parent: 'b' })] })
    // b goes under c by ref; c under b would be a cycle, so c falls back to the URL rule (root)
    expect(shape(navTree(b, ['docs'], 'de'))).toEqual(['/a', { '/c': ['/a/b'] }])
  })
})

describe('breadcrumbs', () => {
  const tree = navTree(bundle({ docs: [doc('r', '/docs'), doc('a', '/docs/a'), doc('b', '/docs/a/b')] }), ['docs'], 'de')
  it('returns the nodes from root to the path, tolerating a trailing slash', () => {
    expect(breadcrumbs(tree, '/docs/a/b').map((n) => n.path)).toEqual(['/docs', '/docs/a', '/docs/a/b'])
    expect(breadcrumbs(tree, '/docs/a/').map((n) => n.id)).toEqual(['r', 'a'])
  })
  it('is empty when the path is not in the tree', () => {
    expect(breadcrumbs(tree, '/nope')).toEqual([])
  })
})
