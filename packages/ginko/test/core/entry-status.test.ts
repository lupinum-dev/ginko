// statusOf (design V2 5.13 part 1): one answer to "what do visitors see now, and what waits", for every reader.
import { describe, expect, it } from 'vitest'
import restaurant from '../../../../sites/restaurant/ginko.config.ts'
import { fileStatusInput, serializeSchema, statusOf, type StatusInput } from '../../src/internal.ts'

const schema = serializeSchema(restaurant)
const events = schema.bricks.events!
const menu = schema.bricks.menu!
const TODAY = '2026-10-08'
const AT = Date.parse('2026-10-09T08:00:00Z')
const event = (to?: string) => (to ? { when: { from: '2026-10-01', to } } : {})

describe('statusOf', () => {
  // Wrong behaviour caught: a reader calls an ended entry a draft (or online), shows a plan and a stop at once, lists
  // "ends" for an entry without an end or that is not online, or loses who planned it.
  it.each<[string, typeof events, StatusInput, ReturnType<typeof statusOf>]>([
    ['online without an end rule', menu, { data: {}, state: 'live' }, { now: 'online', waiting: [] }],
    ['online with an empty end field', events, { data: event(), state: 'live' }, { now: 'online', waiting: [] }],
    ['online until today', events, { data: event('2026-10-08'), state: 'live' }, { now: 'online', waiting: [{ kind: 'ends', on: '2026-10-08' }] }],
    ['ended yesterday', events, { data: event('2026-10-07'), state: 'live' }, { now: 'ended', waiting: [] }],
    ['online with unpublished changes and an end', events, { data: event('2026-10-20'), state: 'live', unpublished: { by: 'u1', since: AT } },
      { now: 'online', waiting: [{ kind: 'unpublished', by: 'u1', since: AT }, { kind: 'ends', on: '2026-10-20' }] }],
    // `now` and `waiting` are independent (spec 5.13.1): the saved changes still wait, the end does not.
    ['ended with unpublished changes', events, { data: event('2026-10-01'), state: 'live', unpublished: { since: AT } }, { now: 'ended', waiting: [{ kind: 'unpublished', since: AT }] }],
    ['a draft', events, { data: event('2026-10-01'), state: 'draft' }, { now: 'draft', waiting: [] }],
    ['a planned draft', events, { data: event('2026-10-20'), state: 'draft', publishAt: AT, publishBy: 'u1' }, { now: 'draft', waiting: [{ kind: 'planned', at: AT, by: 'u1' }] }],
    ['a planned draft from an import has no person', events, { data: {}, state: 'draft', publishAt: AT }, { now: 'draft', waiting: [{ kind: 'planned', at: AT }] }],
    ['a stopped draft', events, { data: {}, state: 'draft', stopped: { at: AT, by: 'u1', reason: { code: 'link', href: '/x' } } },
      { now: 'draft', waiting: [{ kind: 'stopped', at: AT, by: 'u1', reason: { code: 'link', href: '/x' } }] }],
  ])('%s', (_, brick, entry, expected) => {
    expect(statusOf(brick, entry, TODAY)).toEqual(expected)
  })
})

describe('fileStatusInput', () => {
  const now = new Date('2026-10-08T10:00:00Z') // 12:00 in Vienna
  // Wrong behaviour caught: a file entry gets another status than the same entry on the platform, or a `$publishAt`
  // is read in the build machine's zone instead of the site's.
  it.each<[string, { $draft?: boolean; $publishAt?: string }, Pick<StatusInput, 'state' | 'publishAt'>]>([
    ['no dollar key is online', {}, { state: 'live' }],
    ['$draft is a draft', { $draft: true }, { state: 'draft' }],
    ['$draft with a $publishAt to come is a draft, and nothing is planned', { $draft: true, $publishAt: '2026-10-08T12:30' }, { state: 'draft' }],
    ['a $publishAt that passed is online', { $publishAt: '2026-10-08T11:59' }, { state: 'live' }],
    ['a $publishAt to come is planned, at the site\'s wall clock', { $publishAt: '2026-10-08T12:30' }, { state: 'draft', publishAt: Date.parse('2026-10-08T10:30:00Z') }],
    ['a day alone means its start', { $publishAt: '2026-10-09' }, { state: 'draft', publishAt: Date.parse('2026-10-08T22:00:00Z') }],
  ])('%s', (_, dollar, expected) => {
    expect(fileStatusInput(dollar, {}, 'Europe/Vienna', now)).toEqual({ data: {}, ...expected })
  })
})
