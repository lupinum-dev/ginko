// Facts on the platform: what the Studio shows for each fact, which texts quote it, and a release that would leave a
// quote without its fact.
import { factComponent, type Schema } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import { errorOf, setup } from './setup'

type Setup = Awaited<ReturnType<typeof setup>>
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const SITE = { site: 'restaurant' }

/** The restaurant with the facts contact.phone and contact.email; its imprint quotes the phone. */
async function withFacts(s: Setup): Promise<Schema> {
  const site = (await s.t.run((ctx) => ctx.db.get(s.site)))!
  const schema = copy(site.schema) as Schema
  schema.components = { ...schema.components, fact: factComponent(['contact.phone', 'contact.email'], schema.bricks) }
  const legal = s.entries.legal!
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.site, { schema })
    const row = (await ctx.db.get(legal))!
    const imprint = (row.data as { imprint: Record<string, string> }).imprint
    await ctx.db.patch(legal, { data: { ...row.data, imprint: { ...imprint, de: `${imprint.de}\n\nTelefon: :fact{name="contact.phone"}` } } })
  })
  return schema
}

const without = (schema: Schema, fact: string): Schema => {
  const next = copy(schema)
  const name = next.components!.fact!.props.name!
  if (name.type === 'choice') name.options = name.options.filter((option) => option.value !== fact)
  return next
}

describe('facts', () => {
  afterEach(() => vi.unstubAllEnvs())

  // Wrong behaviour caught: the Studio named a fact by its label only, so an editor could not tell what the page shows.
  it('every member reads what each fact shows and the entry it comes from', async () => {
    const s = await setup()
    await withFacts(s)
    const facts = await s.as.cook.query(api.facts.values, SITE)
    expect(facts).toEqual([
      { name: 'contact.phone', brick: 'contact', field: 'phone', text: '+43 662 000 000', copies: ['+43 662 000 000'], brickLabel: expect.anything(), entry: s.entries.contact },
      { name: 'contact.email', brick: 'contact', field: 'email', text: 'office@gasthaus-linde.example', copies: ['office@gasthaus-linde.example'], brickLabel: expect.anything(), entry: s.entries.contact },
    ])
  })

  // Wrong behaviour caught: an editor changed the phone number without knowing which pages show it.
  it('lists the texts that quote the facts of a brick', async () => {
    const s = await setup()
    await withFacts(s)
    expect(await s.as.owner.query(api.facts.uses, { ...SITE, brick: 'contact' })).toEqual({
      'contact.phone': [expect.objectContaining({ entry: s.entries.legal, brick: 'legal', paths: ['imprint'], state: 'live' })],
    })
    expect(await s.as.owner.query(api.facts.uses, { ...SITE, brick: 'menu' })).toEqual({})
  })

  // Wrong behaviour caught: a release dropped a fact that the imprint still quotes, and the imprint lost the phone number.
  it('a release that drops a quoted fact is refused and names the texts; an unquoted one goes through', async () => {
    const s = await setup()
    const schema = await withFacts(s)
    const site = (await s.t.run((ctx) => ctx.db.get(s.site)))!
    const release = (next: Schema) => s.t.mutation(internal.release.release, {
      site: s.site, actor: 'pushkey:test', commit: crypto.randomUUID().replaceAll('-', ''),
      expectedSchemaRev: site.schemaRev, expectedContentRev: site.contentRev, schema: next, writes: [],
    })
    expect(await errorOf(release(without(schema, 'contact.phone')))).toMatchObject({
      code: 'SCHEMA_REJECTED',
      details: { rejected: [expect.objectContaining({ path: 'facts.contact.phone', kind: 'factInUse', message: expect.stringContaining('„Rechtliches“'), fix: expect.stringContaining('aus diesen Texten') })] },
    })
    await release(without(schema, 'contact.email'))
    expect(((await s.t.run((ctx) => ctx.db.get(s.site)))!.schema as Schema).components!.fact!.props.name).toMatchObject({ options: [{ value: 'contact.phone' }] })
  })

  it('pnpm local:dev lets the dropped fact through with a warning', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    const schema = await withFacts(s)
    const pushed = await s.t.mutation(internal.release.devPush, { site: 'restaurant', schema: without(schema, 'contact.phone') })
    expect(pushed).toMatchObject({ warnings: [expect.objectContaining({ path: 'facts.contact.phone', kind: 'factInUse' })] })
  })
})
