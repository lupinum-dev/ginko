import { describe, expect, it } from 'vitest'
import type { NavNode } from '@lupinum/ginko'
import { enrichNav, type DocFields } from '../app/lib/docsNav'

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
})
