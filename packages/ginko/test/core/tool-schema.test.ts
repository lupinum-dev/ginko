// What an AI assistant may send for a task. Wrong here means a price 100× too high, a delete without
// confirmation, or a prefill the assistant cannot read.
import { describe, expect, it } from 'vitest'
import restaurant from '../../../../sites/restaurant/ginko.config.ts'
import type { Brick, Task } from '../../src/index.ts'
import { fromToolInput, taskInputSchema } from '../../src/internal.ts'

const ctx = { mainLocale: 'de', currency: 'EUR' } as const
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
        until: { type: 'string', description: 'Gilt bis (YYYY-MM-DD)', pattern: '^\\d{4}-\\d{2}-\\d{2}$', default: '2026-10-10' },
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

  it('the weekly plan is a list of exactly seven days with known weekday codes', () => {
    const week: Task = { id: 'week', label: 'Wochenplan', kind: 'edit', fields: ['week'] }
    const list = taskInputSchema(bricks.hours!, week, ctx).properties.week!
    expect(list).toMatchObject({ type: 'array', minItems: 7, maxItems: 7 })
    expect(list.items?.properties?.day?.enum).toEqual(['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'])
    expect(list.items?.required).toEqual(['day', 'closed'])
  })

  it('a create task leaves out the slug: it comes from the title', () => {
    const schema = taskInputSchema(bricks.events!, task('events', 'add'), ctx)
    expect(Object.keys(schema.properties)).not.toContain('slug')
    expect(schema.required).toEqual(['title', 'when', 'description'])
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

  it('a list row keeps its ID when it is the same row, so its translations stay attached', () => {
    const stored = { days: [{ _id: 'ldmo000000', day: 'mo', dish: { de: 'Suppe', en: 'Soup' }, allergens: [] }] }
    const data = fromToolInput(bricks.lunch!.fields, {
      days: [{ day: 'tu', dish: 'Gulasch', allergens: [] }, { day: 'mo', dish: 'Linsensuppe', allergens: ['L'] }],
    }, { mainLocale: 'de', stored, newRowId: ids() })
    expect(data.days).toEqual([
      { _id: 'newrow0001', day: 'tu', dish: { de: 'Gulasch' }, allergens: [] },
      { _id: 'ldmo000000', day: 'mo', dish: { de: 'Linsensuppe' }, allergens: ['L'] },
    ])
  })
})
