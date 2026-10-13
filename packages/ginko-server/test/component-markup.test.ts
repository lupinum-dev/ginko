// The 0.4.0 migration of stored component markup (convex/migrateComponentMarkup.ts).
import { printOf } from '@lupinum/ginko/internal'
import { describe, expect, test, vi } from 'vitest'
import { internal } from '../convex/_generated/api'
import { renameComponentMarkup } from '../convex/lib/componentMarkup'
import { setup } from './setup'

describe('renameComponentMarkup', () => {
  test.each([
    ['embedded becomes embed', '::embedded{src="https://x.example/map" title="Karte"}\n::', '::embed{src="https://x.example/map" title="Karte"}\n::'],
    ['surface becomes background, default becomes none', '::flow{surface="default"}\nx\n::', '::flow{background="none"}\nx\n::'],
    ['layout frame and surface, nested', ':::layout{frame="default" surface="muted"}\n::column\nx\n::\n:::', ':::layout{frame="none" background="muted"}\n::column\nx\n::\n:::'],
    ['bound and unquoted forms', "::center{frame=default}\n::\n::flow{:surface='tint'}\n::", "::center{frame=none}\n::\n::flow{:background='tint'}\n::"],
    ['figure: default was the framed look', '::figure{src="/a.png" alt="A" frame="default"}\n::', '::figure{src="/a.png" alt="A" frame="border"}\n::'],
    ['quiz-question type becomes mode; a quoted text stays', '::quiz-question{question="type=multiple?" type="multiple"}\n- [x] a\n::', '::quiz-question{question="type=multiple?" mode="multiple"}\n- [x] a\n::'],
    ['code-tree defaultValue becomes file', '::code-tree{defaultValue="a.ts" expandAll}\n::', '::code-tree{file="a.ts" expandAll}\n::'],
    ['the same names on other tags stay', '::api-param{name="x" defaultValue="1" type="number"}\n::\n::callout{type="info" frame="default"}\n::', null],
    ['text that only looks like markup stays', 'mailto:embedded, 12:30, ::embedded-map, ::card{title=":embedded"}', null],
  ])('%s', (_name, before, after) => {
    const once = renameComponentMarkup(before)
    expect(once).toBe(after ?? before)
    expect(renameComponentMarkup(once)).toBe(once)
  })
})

describe('migrateComponentMarkup.run', () => {
  test('rewrites entries and history, keeps a fresh translation fresh, and changes nothing on a second run', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    const { t, site } = await setup()
    const old = { de: '::embedded{src="https://x.example/map" title="Karte"}\n::', en: '::embedded{src="https://x.example/map" title="Map"}\n::' }
    const legal = await t.run(async (ctx) => {
      const entry = (await ctx.db.query('entries').collect()).find((e) => e.brick === 'legal')!
      await ctx.db.patch(entry._id, { data: { ...entry.data, imprint: old }, prints: { imprint: { en: printOf(old.de) } } })
      await ctx.db.insert('changes', { site, entry: entry._id, brick: 'legal', actor: 'u-wirtin', opId: 'op-1', kind: 'save', sentence: 'x', before: { imprint: old }, after: { imprint: old }, contentRev: 1, at: Date.now() })
      return entry
    })
    const before = await t.run(async (ctx) => (await ctx.db.get(site))!)

    await t.mutation(internal.migrateComponentMarkup.run, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const [entry, change, after] = await t.run(async (ctx) => [
      (await ctx.db.get(legal._id))!,
      (await ctx.db.query('changes').collect()).find((c) => c.opId === 'op-1')!,
      (await ctx.db.get(site))!,
    ] as const)
    const renamed = { de: '::embed{src="https://x.example/map" title="Karte"}\n::', en: '::embed{src="https://x.example/map" title="Map"}\n::' }
    expect(entry.data.imprint).toEqual(renamed)
    expect(entry.prints).toEqual({ imprint: { en: printOf(renamed.de) } })
    expect(entry.rev).toBe(legal.rev + 1)
    expect(change.before).toEqual({ imprint: renamed })
    expect(after.contentRev).toBe(before.contentRev + 1)
    expect(after.bytes - before.bytes).toBe(entry.bytes - legal.bytes)

    await t.mutation(internal.migrateComponentMarkup.run, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await t.run(async (ctx) => (await ctx.db.get(legal._id))!.rev)).toBe(entry.rev)
  })
})
