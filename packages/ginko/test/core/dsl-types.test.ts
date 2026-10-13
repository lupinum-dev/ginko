import { describe, expect, it } from 'vitest'
import { collection, defineSite, f, single } from '../../src/index.ts'

// The authoring types reject input the validator would only reject at `ginko release`. `pnpm typecheck`
// runs this file: each `@ts-expect-error` fails the check when a type is widened again.

const base = { site: 'linde', name: 'Linde', url: 'https://linde.example', timezone: 'Europe/Vienna', locales: ['de'], currency: 'EUR', pages: { home: '/' } } as const

describe('authoring types', () => {
  it('retired takes only bricks and fields of the config', () => {
    const bricks = { menu: collection({ label: 'Karte', fields: { name: f.text('Name'), old: f.text('Alt', { optional: true }) }, max: 5, order: 'manual' }), hours: single({ label: 'Zeiten', fields: { note: f.text('Hinweis') } }) }
    defineSite({ ...base, bricks, retired: { 'menu.old': { drop: true }, hours: { drop: true } } })
    // @ts-expect-error a field that does not exist
    defineSite({ ...base, bricks, retired: { 'menu.gone': { drop: true } } })
    // @ts-expect-error the empty rule from before 0.4
    defineSite({ ...base, bricks, retired: { 'menu.old': {} } })
    expect(true).toBe(true)
  })
})
