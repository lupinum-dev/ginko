import { describe, expect, it } from 'vitest'
import type { NavNode } from '@lupinum/ginko'
import { navTree, outline, type Bundle, type BundleItem, type OutlineNode, type OutlineRow } from '@lupinum/ginko/internal'
import { enrichNav, type DocFields, type DocNode } from '../app/lib/docsNav'

const node = (id: string, children: NavNode[] = []): NavNode => ({ id, title: id, path: `/docs/${id}`, children } as NavNode)

describe('enrichNav', () => {
  it('runs tabs and sections over the roots; a new tab resets the section; children follow their parent', () => {
    const fields: Record<string, DocFields> = {
      intro: { tab: 'Guide', section: 'Start' },
      setup: {},
      api: { tab: 'Reference' },
      hooks: { section: 'Hooks', tab: 'Guide' },
    }
    const out = enrichNav([node('intro'), node('setup', [node('child')]), node('api'), node('hooks')], (id) => fields[id])
    expect(out.map((n) => [n.id, n.tab, n.section])).toEqual([
      ['intro', 'Guide', 'Start'],
      ['setup', 'Guide', 'Start'],
      ['api', 'Reference', undefined],
      ['hooks', 'Guide', 'Hooks'],
    ])
    expect(out[1]!.children[0]).toMatchObject({ id: 'child', tab: 'Guide', section: undefined })
  })

  // Wrong behaviour caught: a long page title squeezed into the side navigation although the editor gave a short one.
  it('shows the short title in the navigation, also for children, and the title where there is none', () => {
    const fields: Record<string, DocFields> = { intro: { navTitle: 'Start' }, child: { navTitle: 'Kind' } }
    const out = enrichNav([node('intro', [node('child')]), node('setup')], (id) => fields[id])
    expect([out[0]!.title, out[0]!.children[0]!.title, out[1]!.title]).toEqual(['Start', 'Kind', 'setup'])
  })
})

// Wrong behaviour caught: the Studio's docs tree (core `outline`) shows a page in another place, tab or section than the
// website does, so an owner arranges pages by a picture that is not the site. Random structures, stored cycles included.
describe('the Studio outline and the website', () => {
  it('nest and group the same pages the same way', () => {
    let seed = 11
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n }
    for (let round = 0; round < 300; round++) {
      const rows: OutlineRow[] = Array.from({ length: 2 + rnd(10) }, (_, i) => ({ id: `p${i}` }))
      for (const r of rows) {
        if (rnd(3) === 0) r.section = ['A', 'B'][rnd(2)]
        if (rnd(5) === 0) r.tab = ['X', 'Y'][rnd(2)]
        if (rnd(3) === 0) r.parent = rows[rnd(rows.length)]!.id
      }
      const items: BundleItem[] = rows.map((r) => ({ id: r.id, data: { title: r.id, ...r }, fallback: [], urls: { en: `/docs/${r.id}` } }))
      const bundle = { format: 3, site: 's', locale: 'en', locales: ['en'], mainLocale: 'en', currency: 'EUR', schemaRev: 1, contentRev: 1, generatedAt: '', bricks: { docs: { kind: 'collection', items } } } as Bundle
      const site = enrichNav(navTree(bundle, ['docs'], 'en'), (id) => rows.find((r) => r.id === id))
      const fromSite = (n: DocNode): unknown => [n.id, n.tab, n.section, n.children.map(fromSite)]
      const fromOutline = (n: OutlineNode, tab?: string): unknown => [n.row.id, n.tab ?? tab, n.section, n.children.map((c) => fromOutline(c, n.tab ?? tab))]
      expect(outline(rows).map((n) => fromOutline(n)), JSON.stringify(rows)).toEqual(site.map(fromSite))
    }
  })
})
