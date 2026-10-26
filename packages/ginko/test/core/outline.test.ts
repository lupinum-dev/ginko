import { describe, expect, it } from 'vitest'
import { applyPlace as apply, navTabs, outline, placePlan, walkOutline, type OutlineRow, type Place } from '../../src/core/outline.ts'

/** What the website shows: tabs, section runs, and each page's place as "a/b/c" titles. */
function shown(rows: OutlineRow[]) {
  const tree = outline(rows)
  const path = (id: string): string => {
    const n = walkOutline(tree).find((x) => x.row.id === id)!
    const parent = walkOutline(tree).find((x) => x.children.includes(n))
    return parent ? `${path(parent.row.id)}/${id}` : id
  }
  return navTabs(tree).map((t) => ({ tab: t.title, sections: t.sections.map((s) => ({ section: s.title, pages: s.nodes.flatMap((n) => walkOutline([n]).map((x) => path(x.row.id))) })) }))
}

const docs: OutlineRow[] = [
  { id: 'intro', tab: 'Learn', section: 'Start' },
  { id: 'setup' },
  { id: 'install', parent: 'setup' },
  { id: 'auth', section: 'Guides' },
  { id: 'keys', parent: 'auth' },
  { id: 'paging' },
  { id: 'errors' },
  { id: 'client', tab: 'API', section: 'Reference' },
  // Nested under a page of another section and tab, stored down here, with a section the website ignores.
  { id: 'budget', parent: 'errors', section: 'Advanced' },
  { id: 'monitors' },
]

describe('placePlan', () => {
  // Wrong behaviour each row catches: a page lands elsewhere than asked, a section heading moves with the page that
  // happened to carry it, or the page drags its old tab or section along.
  it.each<[string, string, Place, ReturnType<typeof shown>]>([
    ['moves a page up within its section', 'errors', { after: 'auth' }, [
      { tab: 'Learn', sections: [{ section: 'Start', pages: ['intro', 'setup', 'setup/install'] }, { section: 'Guides', pages: ['auth', 'auth/keys', 'errors', 'errors/budget', 'paging'] }] },
      { tab: 'API', sections: [{ section: 'Reference', pages: ['client', 'monitors'] }] }]],
    ['moves the first page of a section away; the heading stays with the pages', 'auth', { after: 'paging' }, [
      { tab: 'Learn', sections: [{ section: 'Start', pages: ['intro', 'setup', 'setup/install'] }, { section: 'Guides', pages: ['paging', 'auth', 'auth/keys', 'errors', 'errors/budget'] }] },
      { tab: 'API', sections: [{ section: 'Reference', pages: ['client', 'monitors'] }] }]],
    ['puts a page first in a section: it takes over the heading', 'errors', { before: 'auth' }, [
      { tab: 'Learn', sections: [{ section: 'Start', pages: ['intro', 'setup', 'setup/install'] }, { section: 'Guides', pages: ['errors', 'errors/budget', 'auth', 'auth/keys', 'paging'] }] },
      { tab: 'API', sections: [{ section: 'Reference', pages: ['client', 'monitors'] }] }]],
    ['moves a page into another tab', 'paging', { after: 'monitors' }, [
      { tab: 'Learn', sections: [{ section: 'Start', pages: ['intro', 'setup', 'setup/install'] }, { section: 'Guides', pages: ['auth', 'auth/keys', 'errors', 'errors/budget'] }] },
      { tab: 'API', sections: [{ section: 'Reference', pages: ['client', 'monitors', 'paging'] }] }]],
    ['moves the first page of a tab out; the next page starts the tab and its section', 'client', { after: 'errors' }, [
      { tab: 'Learn', sections: [{ section: 'Start', pages: ['intro', 'setup', 'setup/install'] }, { section: 'Guides', pages: ['auth', 'auth/keys', 'paging', 'errors', 'errors/budget', 'client'] }] },
      { tab: 'API', sections: [{ section: 'Reference', pages: ['monitors'] }] }]],
    ['nests a page with its subpages under another', 'auth', { parent: 'setup', after: 'install' }, [
      { tab: 'Learn', sections: [{ section: 'Start', pages: ['intro', 'setup', 'setup/install', 'setup/auth', 'setup/auth/keys'] }, { section: 'Guides', pages: ['paging', 'errors', 'errors/budget'] }] },
      { tab: 'API', sections: [{ section: 'Reference', pages: ['client', 'monitors'] }] }]],
    ['moves a nested page out to the top level after its parent', 'install', { after: 'setup' }, [
      { tab: 'Learn', sections: [{ section: 'Start', pages: ['intro', 'setup', 'install'] }, { section: 'Guides', pages: ['auth', 'auth/keys', 'paging', 'errors', 'errors/budget'] }] },
      { tab: 'API', sections: [{ section: 'Reference', pages: ['client', 'monitors'] }] }]],
    ['moves a page stored in another section out of its parent: it lands where asked, not where it was stored', 'budget', { after: 'errors' }, [
      { tab: 'Learn', sections: [{ section: 'Start', pages: ['intro', 'setup', 'setup/install'] }, { section: 'Guides', pages: ['auth', 'auth/keys', 'paging', 'errors', 'budget'] }] },
      { tab: 'API', sections: [{ section: 'Reference', pages: ['client', 'monitors'] }] }]],
  ])('%s', (_, id, place, expected) => {
    const plan = placePlan(docs, id, place)
    if (typeof plan === 'string') throw new Error(plan)
    expect(shown(apply(docs, plan))).toEqual(expected)
  })

  // Wrong behaviour caught: a page put inside its own subpage disappears from the navigation (a cycle).
  it('refuses a place inside the page itself or its subpages, and unknown pages', () => {
    expect(placePlan(docs, 'auth', { parent: 'keys' })).toBe('cycle')
    expect(placePlan(docs, 'auth', { parent: 'auth' })).toBe('cycle')
    expect(placePlan(docs, 'auth', { after: 'gone' })).toBe('missing')
    // `after` must be a sibling at the place.
    expect(placePlan(docs, 'paging', { after: 'install' })).toBe('invalid')
  })

  // Wrong behaviour caught: a move to the same place writes the page (a history line, a new revision) for nothing.
  it('writes nothing for the place the page already has', () => {
    expect(placePlan(docs, 'paging', { after: 'auth' })).toEqual({ order: docs.map((r) => r.id), patch: {} })
    expect(placePlan(docs, 'auth', { before: 'paging' })).toEqual({ order: docs.map((r) => r.id), patch: {} })
  })

  // Wrong behaviour caught: the heading handover leaves stale copies: the old first page keeps "Guides" and the new
  // one gets it too, so a later move of either would split the section.
  it('writes the least: the heading moves to the new first page instead of being copied', () => {
    expect(placePlan(docs, 'errors', { before: 'auth' })).toMatchObject({ patch: { errors: { section: { from: 'auth' } }, auth: { section: null } } })
  })

  // The invariant behind every case above, over random structures and moves: the moved page lands at its place,
  // and every other page keeps its tab, its section, its parent and its order relative to the others.
  it('keeps every other page where the website shows it, for random structures and moves', () => {
    let seed = 7
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n }
    const pick = <T>(xs: T[]) => xs[rnd(xs.length)]!
    for (let round = 0; round < 400; round++) {
      const rows: OutlineRow[] = Array.from({ length: 3 + rnd(9) }, (_, i) => ({ id: `p${i}` }))
      for (const r of rows) {
        if (rnd(4) === 0) r.section = pick(['A', 'B', 'C'])
        if (rnd(6) === 0) r.tab = pick(['X', 'Y'])
        if (rnd(4) === 0) r.parent = pick(rows).id
        if (rnd(5) === 0) r.draft = true
      }
      // No stored cycles here (the website breaks them by stored order, so a move may change which page is the root).
      for (const r of rows) {
        const seen = new Set<string>()
        for (let p: OutlineRow | undefined = r; p?.parent; p = rows.find((x) => x.id === p!.parent)) {
          if (seen.has(p.id)) { delete r.parent; break }
          seen.add(p.id)
        }
      }
      const tree = outline(rows)
      const nodes = walkOutline(tree)
      const id = pick(nodes).row.id
      const target = pick(nodes)
      const parentOf = (n: string) => nodes.find((x) => x.children.some((c) => c.row.id === n))?.row.id
      const place: Place = pick([
        { after: target.row.id },
        { parent: target.row.id },
        ...(parentOf(target.row.id) === undefined ? [{ before: target.row.id }] : []),
      ])
      const host = 'after' in place && place.after !== undefined ? parentOf(place.after) : undefined
      if (host !== undefined) Object.assign(place, { parent: host })
      const plan = placePlan(rows, id, place)
      if (typeof plan === 'string') continue
      const after = outline(apply(rows, plan))
      const website = (xs: OutlineRow[]) => outline(xs.filter((r) => !r.draft))
      const all = walkOutline(after)
      const block = new Set(walkOutline([nodes.find((n) => n.row.id === id)!]).map((n) => n.row.id))
      const facts = (roots: ReturnType<typeof outline>, skip: Set<string>) => {
        const out: string[] = []
        const walk = (n: (typeof roots)[number], parent: string | undefined, tab?: string, section?: string) => {
          if (!skip.has(n.row.id)) out.push(`${n.row.id}:${parent ?? '-'}:${n.tab ?? tab ?? '-'}:${parent ? '' : (n.section ?? '-')}`)
          n.children.forEach((c) => walk(c, n.row.id, n.tab ?? tab))
        }
        roots.forEach((r) => walk(r, undefined))
        return out
      }
      // Other pages on the website: same parent, tab, section and relative order. (The block moves as one; its own
      // inside does not change. Drafts are not on the website, so a heading never goes to one.)
      expect(facts(website(apply(rows, plan)), block), JSON.stringify({ rows, id, place })).toEqual(facts(website(rows), block))
      // The moved page: at its place, with the tab and section of that place.
      const moved = all.find((n) => n.row.id === id)!
      const newParent = all.find((n) => n.children.includes(moved))?.row.id
      expect(newParent, JSON.stringify({ rows, id, place })).toBe('parent' in place ? place.parent : undefined)
      if (!('parent' in place)) {
        const anchor = after.find((n) => n.row.id === ('after' in place ? place.after : place.before))!
        // A draft takes no heading, so it cannot be the first page of a section (it shows the running one).
        if (!('before' in place && rows.find((r) => r.id === id)!.draft)) expect([moved.tab, moved.section], JSON.stringify({ rows, id, place })).toEqual([anchor.tab, anchor.section])
        const roots = after.map((n) => n.row.id)
        expect(roots.indexOf(id) - roots.indexOf(anchor.row.id), JSON.stringify({ rows, id, place })).toBe('after' in place ? 1 : -1)
      } else {
        const sibs = all.find((n) => n.row.id === place.parent)!.children.map((c) => c.row.id)
        expect(place.after ? sibs.indexOf(id) - sibs.indexOf(place.after) : sibs.indexOf(id), JSON.stringify({ rows, id, place })).toBe(place.after ? 1 : 0)
      }
      expect(block.size).toBeGreaterThan(0)
    }
  })
})
