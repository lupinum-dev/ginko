// Today's pure rules (utils/today.ts) on the restaurant: which card each task lands in, as a button or in "⋯", and
// what "Wartet auf dich" lists and the verdict counts.
import { expect, test } from 'vitest'
import { ordered, serializeSchema } from '@lupinum/ginko/internal'
import restaurant from '../../../sites/restaurant/ginko.config.ts'
import { cardsOf, verdictCount, waitingOf, type LocalDraftRow, type OwnRow } from '../app/utils/today'

const schema = serializeSchema(restaurant)
const de = (label: unknown) => (typeof label === 'string' ? label : (label as { de: string }).de)

/** The cards for a person holding `granted` (brick → task ids; '*' all) with `rows` real rows per timed brick (default 3). */
function layout(granted: Record<string, string[] | '*'>, rows: Record<string, number> = {}) {
  const parts = ordered(schema.bricks).flatMap(([key, brick]) => {
    const held = granted[key]
    const tasks = (brick.tasks ?? []).filter((t) => held === '*' || held?.includes(t.id))
    const timed = brick.kind === 'collection' && !!brick.visible && brick.visible.mode !== 'always'
    return tasks.length ? [{ key, tasks, removeOnRows: timed && (rows[key] ?? 3) <= 10 }] : []
  })
  return Object.fromEntries(cardsOf(schema, parts).map((card) => [card.key, card.sections.map((x) => ({
    key: x.key, buttons: x.split.buttons.map((t) => de(t.label)), more: x.split.more.map((t) => de(t.label)),
  }))]))
}
const all = Object.fromEntries(Object.keys(schema.bricks).map((k) => [k, '*' as const]))

// Wrong behaviour caught: a task disappears from Today, a frequent task lands in "⋯", a remove task shows both on the
// rows and in "⋯", or a plan is merged into a card the person cannot see.
test.each<[string, Record<string, string[] | '*'>, Record<string, number>, Record<string, { key: string; buttons: string[]; more: string[] }[]>]>([
  ['owner, short lists', all, {}, {
    hours: [
      { key: 'hours', buttons: ['Heute geschlossen', 'Betriebsurlaub und Ausnahmen', 'Öffnungszeiten an Feiertagen'], more: [] },
      { key: 'hourPlans', buttons: ['Neue Öffnungszeiten ab …'], more: ['Öffnungszeiten ab Datum bearbeiten', 'Öffnungszeiten ab Datum entfernen'] },
    ],
    notices: [{ key: 'notices', buttons: ['Heute ausgebucht', 'Hinweis hinzufügen'], more: [] }],
    lunch: [
      { key: 'lunch', buttons: ['Mittagsmenü dieser Woche'], more: [] },
      { key: 'lunchPlans', buttons: ['Nächste Woche planen'], more: ['Geplante Woche bearbeiten'] },
    ],
    menu: [{ key: 'menu', buttons: ['Gericht heute aus', 'Gericht bearbeiten', 'Preis ändern', 'Gericht hinzufügen'], more: ['Gericht entfernen'] }],
    events: [{ key: 'events', buttons: ['Veranstaltung hinzufügen', 'Veranstaltung ausgebucht'], more: [] }],
    gallery: [{ key: 'gallery', buttons: ['Fotos bearbeiten'], more: [] }],
  }],
  ['owner, 11 events: their remove task leaves the rows for "⋯"', { events: '*' }, { events: 11 }, {
    events: [{ key: 'events', buttons: ['Veranstaltung hinzufügen', 'Veranstaltung ausgebucht'], more: ['Veranstaltung entfernen'] }],
  }],
  ['staff with only "Gericht entfernen": a button, no menu', { menu: ['remove'] }, {}, {
    menu: [{ key: 'menu', buttons: ['Gericht entfernen'], more: [] }],
  }],
  ['staff with only "Nächste Woche planen": a card of its own', { lunchPlans: ['planNext'] }, {}, {
    lunchPlans: [{ key: 'lunchPlans', buttons: ['Nächste Woche planen'], more: [] }],
  }],
])('%s', (_name, granted, rows, cards) => {
  expect(layout(granted, rows)).toEqual(cards)
})

const own = (proposal: string, over: Partial<OwnRow> = {}) => ({ proposal, task: 'lunch.lunchWeek', via: 'ui', decidedAt: null, at: null, ...over }) as OwnRow
const draft = (key: string) => ({ key, text: key, label: key, name: key, area: 'Hinweise', time: '14:20', to: `/s/linde/all/notices/${key}` }) satisfies LocalDraftRow
const NOW = Date.UTC(2026, 9, 20, 12)
const DAY = 86_400_000

// Wrong behaviour caught: a rejected proposal ranks under a draft, staff see "Prüfen", a not-live change from weeks ago
// stays, or the verdict counts a not-live change (information) or each waiting review instead of one tile.
test.each<[string, Parameters<typeof waitingOf>[0], string[], string[], number]>([
  ['rank: rejected (newest first), review, unsaved, not live (newest first)', {
    manager: true, review: 4, now: NOW,
    rejected: [{ key: 'lunch', p: own('r-old', { decidedAt: NOW - 2 * DAY }) }, { key: 'lunch', p: own('r-new', { decidedAt: NOW - DAY }) }],
    unsaved: [draft('e1'), draft('e2')],
    notLive: [{ key: 'menu', p: own('n-old', { at: NOW - 3 * DAY }) }, { key: 'menu', p: own('n-new', { decidedAt: NOW - DAY }) }],
  }, [], ['rejected r-new', 'rejected r-old', 'review 4', 'unsaved e1', 'unsaved e2', 'notLive n-new', 'notLive n-old'], 5],
  ['staff with a count get no review tile', { manager: false, review: 3, now: NOW, rejected: [], unsaved: [], notLive: [] }, [], [], 0],
  ['a manager with nothing to review gets none', { manager: true, review: 0, now: NOW, rejected: [], unsaved: [], notLive: [] }, [], [], 0],
  ['not live for more than 7 days is dropped; not live never counts', {
    manager: true, now: NOW, rejected: [], unsaved: [],
    notLive: [{ key: 'menu', p: own('n8', { decidedAt: NOW - 8 * DAY }) }, { key: 'menu', p: own('n6', { decidedAt: NOW - 6 * DAY }) }],
  }, [], ['notLive n6'], 0],
  ['due areas count once each', { manager: true, review: 2, now: NOW, rejected: [], unsaved: [], notLive: [] }, ['hours', 'lunch'], ['review 2'], 3],
])('%s', (_name, input, due, items, count) => {
  const waiting = waitingOf(input)
  expect(waiting.map((x) => `${x.kind} ${x.kind === 'review' ? x.count : x.kind === 'unsaved' ? x.row.key : x.p.proposal}`)).toEqual(items)
  expect(verdictCount(waiting, due)).toBe(count)
})
