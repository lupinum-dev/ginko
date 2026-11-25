// What an AI assistant may send for a task. Wrong here means a price 100× too high, a delete without
// confirmation, or a prefill the assistant cannot read.
import { describe, expect, it } from 'vitest'
import restaurant from '../../../../sites/restaurant/ginko.config.ts'
import type { Brick, Task } from '../../src/index.ts'
import { fromToolInput, taskInputSchema } from '../../src/internal.ts'

const ctx = { mainLocale: 'de', currency: 'EUR', week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] } } as const
const bricks = restaurant.bricks as Record<string, Brick>
const task = (brick: string, id: string) => bricks[brick]!.tasks!.find((t) => t.id === id)!

describe('taskInputSchema', () => {
  it('a create task with prefill: plain text in the main language, nothing required that is prefilled', () => {
    const schema = taskInputSchema(bricks.notices!, task('notices', 'soldOut'), {
      ...ctx,
      prefill: { text: { de: 'Heute sind wir ausgebucht.' }, until: '2026-10-10' },
    })
    expect(schema).toEqual({
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text', maxLength: 140, default: 'Heute sind wir ausgebucht.' },
        until: { type: 'string', description: 'Gilt bis — Leer lassen, wenn der Hinweis bleiben soll, bis du ihn entfernst. (YYYY-MM-DD)', pattern: '^\\d{4}-\\d{2}-\\d{2}$', default: '2026-10-10' },
      },
      required: [],
      additionalProperties: false,
    })
  })

  it('a price change picks an entry and takes euros, not cents', () => {
    const schema = taskInputSchema(bricks.menu!, task('menu', 'price'), { ...ctx, prefill: { price: { amount: 1450 } } })
    expect(schema.required).toEqual(['entry'])
    expect(schema.properties.entry).toMatchObject({ type: 'string' })
    expect(schema.properties.price).toMatchObject({ type: 'number', description: 'Preis in EUR', minimum: 0, default: 14.5 })
  })

  it('a remove task asks only for the entry and an explicit confirmation', () => {
    const schema = taskInputSchema(bricks.menu!, task('menu', 'remove'), ctx)
    expect(Object.keys(schema.properties)).toEqual(['entry', 'confirm'])
    expect(schema.properties.confirm).toMatchObject({ type: 'boolean', const: true })
    expect(schema.required).toEqual(['entry', 'confirm'])
  })

  it('the weekly plan is one object per day, every day required, in the order of the site week', () => {
    const week: Task = { id: 'week', label: 'Wochenplan', kind: 'edit', fields: ['week'] }
    const plan = taskInputSchema(bricks.hours!, week, ctx).properties.week!
    expect(plan).toMatchObject({ type: 'object', required: ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'], additionalProperties: false })
    expect(plan.properties?.mo?.required).toEqual(['closed'])
  })

  it('a create task leaves out the slug: it comes from the title', () => {
    const schema = taskInputSchema(bricks.events!, task('events', 'add'), ctx)
    expect(Object.keys(schema.properties)).not.toContain('slug')
    expect(schema.required).toEqual(['title', 'when', 'description'])
  })

  it('the gastro add task offers the fields it lists', () => {
    const schema = taskInputSchema(bricks.menu!, task('menu', 'add'), ctx)
    expect(Object.keys(schema.properties)).toEqual(['category', 'name', 'description', 'price', 'allergens', 'veg'])
  })

  // Wrong behaviour caught: a new dish could be marked sold out or off the menu in the same call that creates it.
  it('a create task with fields offers only those: a new dish has no sold-out day', () => {
    const schema = taskInputSchema(bricks.menu!, { id: 'add', label: 'Neu', kind: 'create', fields: ['name', 'price', 'soldOutOn'] }, ctx)
    expect(Object.keys(schema.properties)).toEqual(['name', 'price', 'soldOutOn'])
  })
})

describe('fromToolInput', () => {
  const ids = () => { let n = 0; return () => `newrow${String(++n).padStart(4, '0')}`.slice(0, 10) }

  it('turns what an assistant types into the storage format', () => {
    const data = fromToolInput(bricks.events!.fields, {
      title: 'Weinabend',
      price: 14.99,
      description: 'Erster Absatz\nzweite Zeile\n\nZweiter Absatz',
      booking: 'https://example.com/buchen',
      image: { file: 'f1', alt: 'Gläser auf dem Tisch' },
      unknown: 'bleibt draußen',
    }, { mainLocale: 'de', newRowId: ids() })
    expect(data).toEqual({
      title: { de: 'Weinabend' },
      // 14.99 * 100 is 1498.9999… in floating point; a cent must not get lost.
      price: { amount: 1499 },
      // Markdown is stored as the string the assistant wrote, in the main language.
      description: { de: 'Erster Absatz\nzweite Zeile\n\nZweiter Absatz' },
      booking: 'https://example.com/buchen',
      image: { file: 'f1', alt: { de: 'Gläser auf dem Tisch' } },
    })
  })

  it('a list row keeps its ID when it is the same row (the same position), so its translations stay attached', () => {
    const stored = { exceptions: [{ _id: 'ex00000001', when: { from: '2026-12-24', to: '2026-12-24' }, reason: { de: 'Heiligabend', en: 'Christmas Eve' }, closed: true }] }
    const data = fromToolInput(bricks.hours!.fields, {
      exceptions: [
        { when: { from: '2026-12-24', to: '2026-12-24' }, reason: 'Heiligabend', closed: true },
        { when: { from: '2027-01-07', to: '2027-01-08' }, reason: 'Inventur', closed: true },
      ],
    }, { mainLocale: 'de', stored, newRowId: ids() })
    expect((data.exceptions as { _id: string }[]).map((row) => row._id)).toEqual(['ex00000001', 'newrow0001'])
  })
})
