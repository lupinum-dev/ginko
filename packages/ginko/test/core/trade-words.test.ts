// V2 5.9: the core and the server's general code hold no word of a trade. A pattern brings its own rules; the core
// and the server only know them by name. This test reads the code (comments left out) and fails on a trade word in a
// file that has no exception for it. Each exception says why it is still there and when it goes: `cp3` (needs
// `repeats` or dated changes, checkpoint 3), `cp4` (the Today screen's redesign, checkpoint 4), or `stays` (not a trade
// word in that place).
// An exception that no longer matches anything fails too, so the list always shows what is left.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const repo = join(import.meta.dirname, '../../../..')

/** The trade words, as the lower-case parts of an identifier or a text (`workWeekOf` → work, week, of). */
const TERMS = ['hours', 'hour plans', 'opening', 'holiday', 'holidays', 'lunch', 'menu', 'dish', 'dishes', 'allergen', 'allergens', 'restaurant', 'gastro', 'food', 'work week', 'weekly', 'plans']

type Until = 'cp3' | 'cp4' | 'stays'
interface Exception { file: string; term: string; until: Until; reason: string }

const CALENDAR = 'the site calendar (`holidays`, `country`) stays until the hours pattern is reworked (D2)'
const PLANS = 'a collection plans a single ahead (`plans`, one plan per week)'
const WEEKLY = 'the weekly task and the weekly reminder'
const WORK_WEEK = 'the work week (`@workWeek`, `workWeekOf`)'
const RENDERER = 'the Studio and the weekly mail render the line of a status rule keyed by its name (`opening-hours`) until the Today redesign decides a general line form (D6)'
const RULE_PLANS = 'the collection a status rule reads (`status.plans`, D7); `plans` as a concept is reworked with dated changes'

const EXCEPTIONS: Exception[] = [
  { file: 'packages/ginko/src/core/diff.ts', term: 'holidays', until: 'cp3', reason: CALENDAR },
  { file: 'packages/ginko/src/core/diff.ts', term: 'plans', until: 'cp3', reason: PLANS },
  { file: 'packages/ginko/src/core/holidays.ts', term: 'holiday', until: 'cp3', reason: CALENDAR },
  { file: 'packages/ginko/src/core/holidays.ts', term: 'holidays', until: 'cp3', reason: CALENDAR },
  { file: 'packages/ginko/src/core/index.ts', term: 'holiday', until: 'cp3', reason: CALENDAR },
  { file: 'packages/ginko/src/core/index.ts', term: 'holidays', until: 'cp3', reason: CALENDAR },
  { file: 'packages/ginko/src/core/index.ts', term: 'plans', until: 'cp3', reason: PLANS },
  { file: 'packages/ginko/src/core/index.ts', term: 'weekly', until: 'cp3', reason: WEEKLY },
  { file: 'packages/ginko/src/core/index.ts', term: 'work week', until: 'cp3', reason: WORK_WEEK },
  { file: 'packages/ginko/src/core/schema.ts', term: 'holidays', until: 'cp3', reason: CALENDAR },
  { file: 'packages/ginko/src/core/schema.ts', term: 'plans', until: 'cp3', reason: PLANS },
  { file: 'packages/ginko/src/core/schema.ts', term: 'weekly', until: 'cp3', reason: WEEKLY },
  { file: 'packages/ginko/src/core/schema.ts', term: 'work week', until: 'cp3', reason: WORK_WEEK },
  { file: 'packages/ginko/src/core/seo.ts', term: 'food', until: 'stays', reason: 'schema.org type names are a standard vocabulary' },
  { file: 'packages/ginko/src/core/seo.ts', term: 'restaurant', until: 'stays', reason: 'schema.org type names are a standard vocabulary' },
  { file: 'packages/ginko/src/core/site.ts', term: 'holidays', until: 'cp3', reason: CALENDAR },
  { file: 'packages/ginko/src/core/site.ts', term: 'plans', until: 'cp3', reason: PLANS },
  { file: 'packages/ginko/src/core/stale.ts', term: 'plans', until: 'cp3', reason: PLANS },
  { file: 'packages/ginko/src/core/stale.ts', term: 'weekly', until: 'cp3', reason: WEEKLY },
  { file: 'packages/ginko/src/core/stale.ts', term: 'work week', until: 'cp3', reason: WORK_WEEK },
  { file: 'packages/ginko/src/core/status.ts', term: 'plans', until: 'cp3', reason: RULE_PLANS },
  { file: 'packages/ginko/src/core/time.ts', term: 'work week', until: 'cp3', reason: WORK_WEEK },
  { file: 'packages/ginko/src/core/types.ts', term: 'holidays', until: 'cp3', reason: CALENDAR },
  { file: 'packages/ginko/src/core/types.ts', term: 'plans', until: 'cp3', reason: PLANS },
  { file: 'packages/ginko/src/core/types.ts', term: 'work week', until: 'cp3', reason: WORK_WEEK },
  { file: 'packages/ginko-server/convex/entries.ts', term: 'plans', until: 'cp3', reason: PLANS },
  { file: 'packages/ginko-server/convex/entries.ts', term: 'weekly', until: 'cp3', reason: WEEKLY },
  { file: 'packages/ginko-server/convex/entries.ts', term: 'work week', until: 'cp3', reason: WORK_WEEK },
  { file: 'packages/ginko-server/convex/lib/access.ts', term: 'plans', until: 'cp3', reason: PLANS },
  { file: 'packages/ginko-server/convex/lib/access.ts', term: 'work week', until: 'cp3', reason: WORK_WEEK },
  { file: 'packages/ginko-server/convex/lib/list.ts', term: 'plans', until: 'cp3', reason: PLANS },
  { file: 'packages/ginko-server/convex/lib/reminders.ts', term: 'weekly', until: 'cp3', reason: WEEKLY },
  { file: 'packages/ginko-server/convex/lib/status.ts', term: 'hours', until: 'cp4', reason: RENDERER },
  { file: 'packages/ginko-server/convex/lib/status.ts', term: 'plans', until: 'cp3', reason: `${PLANS}; ${RULE_PLANS}` },
  { file: 'packages/ginko-server/convex/reminders.ts', term: 'hours', until: 'cp4', reason: RENDERER },
  { file: 'packages/ginko-server/convex/reminders.ts', term: 'opening', until: 'cp4', reason: RENDERER },
  { file: 'packages/ginko-server/convex/reminders.ts', term: 'plans', until: 'cp3', reason: PLANS },
  { file: 'packages/ginko-server/convex/reminders.ts', term: 'weekly', until: 'cp3', reason: WEEKLY },
  { file: 'packages/ginko-server/convex/reminders.ts', term: 'work week', until: 'cp3', reason: WORK_WEEK },
  { file: 'packages/ginko-server/convex/sites.ts', term: 'weekly', until: 'cp3', reason: WEEKLY },
]

/** Every `.ts` file under `dir`, generated code left out. */
function filesIn(dir: string): string[] {
  return readdirSync(join(repo, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.parentPath.includes('_generated'))
    .map((e) => relative(repo, join(e.parentPath, e.name)))
}

/** The code without its comments: a word in an explanation is no trade knowledge. */
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

/** The lower-case parts of every word: `HOURS_FIELDS` → hours, fields; `workWeekOf` → work, week, of; `summer-menu` → summer, menu. */
const partsOf = (code: string) => code.split(/[^A-Za-z]+/).flatMap((word) => word.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+/g) ?? []).map((p) => p.toLowerCase())

function termsIn(code: string): Set<string> {
  const parts = partsOf(withoutComments(code))
  const found = new Set<string>()
  for (const term of TERMS) {
    const words = term.split(' ')
    for (let i = 0; i + words.length <= parts.length; i++) {
      if (words.every((w, k) => parts[i + k] === w)) { found.add(term); break }
    }
  }
  return found
}

describe('no trade word in the core and the server (V2 5.9)', () => {
  const files = [...filesIn('packages/ginko/src/core'), ...filesIn('packages/ginko-server/convex')].sort()
  const found = files.flatMap((file) => [...termsIn(readFileSync(join(repo, file), 'utf8'))].map((term) => `${file} | ${term}`))
  const allowed = EXCEPTIONS.map((e) => `${e.file} | ${e.term}`)

  // Wrong behaviour caught: a trade word (an hours field, a lunch week) enters the core or the server's general code.
  it('finds no trade word without an exception', () => {
    expect(found.filter((hit) => !allowed.includes(hit))).toEqual([])
  })

  // Wrong behaviour caught: a word left the code, but its exception stays and would let it back in unnoticed.
  it('has no exception that matches nothing', () => {
    expect(allowed.filter((exception) => !found.includes(exception))).toEqual([])
  })

  // Wrong behaviour caught: the reading misses a word inside an identifier or a text, so the test passes on anything.
  it.each([
    ['const HOURS_FIELDS = 1', 'hours'],
    ['resolveToken("@workWeek")', 'work week'],
    ["const name = 'summer-menu'", 'menu'],
  ])('reads %s as %s', (code, term) => {
    expect(termsIn(code).has(term)).toBe(true)
  })

  it('does not read a word in a comment, or a part of a longer word', () => {
    expect([...termsIn('// opening hours\nconst menus = 1; const workweek = 2 /* lunch */')]).toEqual([])
  })
})
