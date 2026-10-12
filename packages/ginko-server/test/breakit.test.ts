// Regressions from the Phase 6b break-it run (SPEC 2.7, 4.1, 7, 10): each test failed before its fix.
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { api } from '../convex/_generated/api'
import { errorOf, opId, setup } from './setup'

const restaurantSlug = 'restaurant'

beforeEach(() => {
  vi.stubEnv('GINKO_MAIL', 'outbox')
  vi.stubEnv('SITE_URL', 'https://ginko.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('escalation', () => {
  it('an owner cannot replace a pending owner invite of the same address with a staff invite', async () => {
    // A new invite replaces the pending one, which is a revoke: owners may not revoke owner invites.
    const { t, as } = await setup()
    await as.admin.mutation(api.invites.create, { site: restaurantSlug, email: 'neu@example.com', role: 'owner', grants: [] })
    const replaced = await errorOf(as.owner.mutation(api.invites.create, { site: restaurantSlug, email: 'neu@example.com', role: 'staff', grants: [] })).then(
      (e) => e.code,
      () => 'resolved',
    )
    const pending = await t.run((ctx) => ctx.db.query('invites').withIndex('by_email', (q) => q.eq('email', 'neu@example.com')).collect())
    expect({ replaced, owner: pending.filter((i) => i.role === 'owner').length }).toEqual({ replaced: 'FORBIDDEN', owner: 1 })
  })
})

describe('replay and concurrency', () => {
  it('a baseRev above the real entry revision (a state that never existed) is refused', async () => {
    // Otherwise fieldRevs > baseRev never holds and the save overwrites changes it never saw.
    const { as, entries } = await setup()
    expect((await errorOf(as.owner.mutation(api.entries.save, { site: restaurantSlug, opId: opId(), entry: entries['menu-saibling']!, baseRev: 99, fields: { price: { amount: 1500 } }, sentence: 'x' }))).code).toBe('CHANGED_SINCE')
  })
})

describe('hostile values', () => {
  it.each([
    ['NUL control character', 'abc\u0000def'],
  ])('a text with a %s is refused', async (_label, text) => {
    const { as } = await setup()
    const data = { text: { de: text }, until: '2026-10-30' }
    expect((await errorOf(as.owner.mutation(api.entries.create, { site: restaurantSlug, opId: opId(), brick: 'notices', data }))).code).toBe('INVALID')
  })
})
