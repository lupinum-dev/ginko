// A revoked Better Auth session loses access at once, not at token expiry (lib/access.ts currentUser).
import { describe, expect, it } from 'vitest'
import { api } from '../convex/_generated/api'
import { errorOf, opId, revokeSession, setup } from './setup'

describe('revoked session', () => {
  it('fails reads and writes at once, while other people keep their access', async () => {
    const { t, as, entries } = await setup()
    const save = { site: 'restaurant', task: 'menu.price', entry: entries['menu-saibling']!, baseRev: 1, fields: { price: { amount: 1450 } }, sentence: 'Preis Saibling 14,50 €' }
    expect(await as.owner.query(api.sites.meta, { site: 'restaurant' })).toMatchObject({ site: { slug: 'restaurant' } })

    await revokeSession(t, 'owner')

    expect((await errorOf(as.owner.query(api.sites.meta, { site: 'restaurant' }))).code).toBe('FORBIDDEN')
    expect((await errorOf(as.owner.mutation(api.entries.save, { publish: true, ...save, opId: opId() }))).code).toBe('FORBIDDEN')
    expect(await t.run((ctx) => ctx.db.query('changes').collect())).toHaveLength(0)
    expect(await as.cook.mutation(api.entries.save, { publish: true, ...save, opId: opId() })).toMatchObject({ rev: 2 })
    expect(await as.admin.query(api.sites.meta, { site: 'restaurant' })).toMatchObject({ site: { slug: 'restaurant' } })
  })
})
