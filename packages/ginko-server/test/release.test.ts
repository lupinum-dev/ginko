// Schema releases (SPEC 5.1–5.3, 10) against the restaurant site: the release mutation,
// the HTTP routes the CLI calls, push keys and the local devPush.
import type { Json } from '@lupinum/ginko'
import { sha256, type Schema } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { errorOf, opId, people, setup, upload } from './setup'

type Setup = Awaited<ReturnType<typeof setup>>
type Write = { entry: string; fields: Record<string, Json> }

const commit = () => crypto.randomUUID().replaceAll('-', '')
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

async function storedSite(s: Setup) {
  return (await s.t.run((ctx) => ctx.db.get(s.site)))!
}

async function storedSchema(s: Setup): Promise<Schema> {
  return (await storedSite(s)).schema as Schema
}

async function rowsOf(s: Setup, brick: string) {
  return s.t.run(async (ctx) => (await ctx.db.query('entries').collect()).filter((e) => e.brick === brick))
}

/** One release as the CLI sends it: revisions default to what the site has now. */
function release(s: Setup, input: {
  schema: Schema; writes?: Write[]; commit?: string; expectedSchemaRev?: number; expectedContentRev?: number
}) {
  return storedSite(s).then((site) => s.t.mutation(internal.release.release, {
    site: s.site,
    actor: 'pushkey:test',
    commit: input.commit ?? commit(),
    expectedSchemaRev: input.expectedSchemaRev ?? site.schemaRev,
    expectedContentRev: input.expectedContentRev ?? site.contentRev,
    schema: input.schema,
    writes: input.writes ?? [],
  }))
}

const SUBTITLE_MIGRATION = { id: '2026-11-menu-subtitle', brick: 'menu', fills: 'subtitle', fingerprint: sha256('menu-subtitle') }

/** The restaurant schema plus a new required `menu.subtitle`, filled by SUBTITLE_MIGRATION. */
function withSubtitle(schema: Schema): Schema {
  const next = copy(schema)
  next.bricks.menu!.fields.subtitle = { type: 'text', label: 'Untertitel', max: 200, translate: false }
  next.migrations.push(SUBTITLE_MIGRATION)
  return next
}

/** Writes for every menu entry, deleted ones too, as SPEC 5.2 step 6 requires. */
async function subtitleWrites(s: Setup, skip: string[] = []): Promise<Write[]> {
  return (await rowsOf(s, 'menu'))
    .filter((e) => !skip.includes(e._id))
    .map((e) => ({ entry: e._id, fields: { subtitle: 'Untertitel' } }))
}

describe('release mutation (SPEC 5.2)', () => {
  // Wrong behaviour caught: a push key (a CI secret) points the site's refresh token at another address, or stores another site's config.
  it.each([
    ['another site', { site: 'andere' }, 'errors.siteNameMismatchInSchema'],
    ['a URL that is no web address', { url: 'javascript:alert(1)' }, 'errors.siteUrlNotWeb'],
    ['a new URL on an internal host', { url: 'https://169.254.169.254' }, 'errors.siteUrlNotAllowed'],
  ])('refuses a config for %s and changes nothing', async (_name, change, key) => {
    const s = await setup()
    const schema = { ...copy(await storedSchema(s)), ...change }
    expect(await errorOf(release(s, { schema }))).toMatchObject({ code: 'INVALID', key })
    expect((await storedSite(s)).schemaRev).toBe(1)
  })

  it('the same commit again returns the stored answer and changes nothing', async () => {
    const s = await setup()
    const schema = copy(await storedSchema(s))
    schema.bricks.hours!.label = 'Öffnungszeiten neu'
    const args = { schema, commit: 'a1b2c3d4e5f6', expectedSchemaRev: 1, expectedContentRev: 1 }
    const first = await release(s, args)
    expect(first).toEqual({ schemaRev: 2, contentRev: 1 })
    expect(await release(s, args)).toEqual(first)
    expect((await storedSite(s)).schemaRev).toBe(2)
    expect((await s.t.run((ctx) => ctx.db.query('changes').collect())).filter((c) => c.kind === 'release')).toHaveLength(1)
  })

  it('a stale expectedSchemaRev is CHANGED_SINCE with the current revisions', async () => {
    const s = await setup()
    const error = await errorOf(release(s, { schema: await storedSchema(s), expectedSchemaRev: 0 }))
    expect(error).toMatchObject({ code: 'CHANGED_SINCE', details: { schemaRev: 1, contentRev: 1 } })
  })

  it('a rejected diff is SCHEMA_REJECTED with the fix text and changes nothing', async () => {
    const s = await setup()
    const schema = copy(await storedSchema(s))
    delete schema.bricks.hours!.fields.closedNote
    const error = await errorOf(release(s, { schema }))
    expect(error).toMatchObject({
      code: 'SCHEMA_REJECTED',
      details: { rejected: [expect.objectContaining({ path: 'hours.closedNote', kind: 'fieldRemoved', fix: expect.stringContaining('retired') })] },
    })
    expect((await storedSite(s)).schemaRev).toBe(1)
  })

  it('a known migration ID with another fingerprint is MIGRATION_CHANGED', async () => {
    const s = await setup()
    await release(s, { schema: withSubtitle(await storedSchema(s)), writes: await subtitleWrites(s) })
    const changed = copy(await storedSchema(s))
    changed.migrations = changed.migrations.map((m) => ({ ...m, fingerprint: sha256('other source') }))
    expect(await errorOf(release(s, { schema: changed }))).toMatchObject({ code: 'MIGRATION_CHANGED' })
  })

  it.each([
    { case: 'a live entry has no write', missing: 'menu-saibling', deleted: false },
    { case: 'a deleted entry has no write', missing: 'menu-schnitzel', deleted: true },
  ])('a new migration with a missing write is MIGRATION_INCOMPLETE: $case', async ({ missing, deleted }) => {
    const s = await setup()
    if (deleted) await s.t.run((ctx) => ctx.db.patch(s.entries[missing]!, { deletedAt: Date.now() }))
    const writes = await subtitleWrites(s, [s.entries[missing]!])
    expect(await errorOf(release(s, { schema: withSubtitle(await storedSchema(s)), writes }))).toMatchObject({ code: 'MIGRATION_INCOMPLETE' })
    expect((await storedSite(s)).schemaRev).toBe(1)
  })

  it('an entry created after the snapshot is CHANGED_SINCE, not MIGRATION_INCOMPLETE', async () => {
    const s = await setup()
    const snapshot = await storedSite(s)
    const writes = await subtitleWrites(s)
    await s.t.run(async (ctx) => {
      const { _id: _ignored, _creationTime: _time, ...row } = (await ctx.db.get(s.entries['menu-saibling']!))!
      await ctx.db.insert('entries', { ...row, order: 99 })
      await ctx.db.patch(s.site, { contentRev: snapshot.contentRev + 1 })
    })
    const error = await errorOf(release(s, { schema: withSubtitle(await storedSchema(s)), writes, expectedContentRev: snapshot.contentRev }))
    expect(error).toMatchObject({ code: 'CHANGED_SINCE' })
  })

  it('a migration and a new required field with a default go through in one release', async () => {
    const s = await setup()
    await s.t.run((ctx) => ctx.db.patch(s.entries['menu-schnitzel']!, { deletedAt: Date.now() }))
    const schema = withSubtitle(await storedSchema(s))
    schema.bricks.menu!.fields.origin = { type: 'text', label: 'Herkunft', max: 100, translate: false, default: 'Haus' }
    expect(await release(s, { schema, writes: await subtitleWrites(s) })).toEqual({ schemaRev: 2, contentRev: 2 })
    const menu = await rowsOf(s, 'menu')
    expect(menu.length).toBeGreaterThan(1)
    expect(menu.every((e) => e.data.origin === 'Haus' && e.data.subtitle === 'Untertitel')).toBe(true)
    expect(await s.t.run((ctx) => ctx.db.query('migrationsApplied').collect())).toEqual([expect.objectContaining({ id: SUBTITLE_MIGRATION.id, schemaRev: 2 })])
  })

  it('a new single brick is created from its defaults with rev 1', async () => {
    const s = await setup()
    const schema = copy(await storedSchema(s))
    schema.bricks.parking = {
      kind: 'single', label: 'Parken',
      fields: {
        phone: { type: 'text', label: 'Telefon', format: 'tel', translate: false, default: '+43 1 000 000' },
        note: { type: 'text', label: 'Notiz', max: 140, translate: false, optional: true },
      },
    }
    expect(await release(s, { schema })).toEqual({ schemaRev: 2, contentRev: 2 })
    const [parking] = await rowsOf(s, 'parking')
    expect(parking).toMatchObject({ kind: 'single', rev: 1, lifeRev: 1, order: 0, data: { phone: '+43 1 000 000' } })
    expect(parking!.data).not.toHaveProperty('note')
  })

  it('contentRev stays when no entry changed, and the release is logged', async () => {
    const s = await setup()
    const schema = copy(await storedSchema(s))
    schema.bricks.hours!.label = 'Öffnungszeiten neu'
    expect(await release(s, { schema, commit: 'abcdef1234567' })).toEqual({ schemaRev: 2, contentRev: 1 })
    expect((await storedSite(s)).contentRev).toBe(1)
    const [change] = (await s.t.run((ctx) => ctx.db.query('changes').collect())).filter((c) => c.kind === 'release')
    expect(change).toMatchObject({ brick: '', sentence: 'Release abcdef1', contentRev: 1, actor: 'pushkey:test' })
  })
})

describe('push keys and the HTTP routes (SPEC 5.1, 10)', () => {
  const get = (s: Setup, token: string, path = '/release/state?site=restaurant') =>
    s.t.fetch(path, { headers: { Authorization: `Bearer ${token}` } })

  const post = (s: Setup, token: string, body: unknown) =>
    s.t.fetch('/release', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })

  const keyFor = async (s: Setup, scopes: ('release' | 'pull' | 'check' | 'export')[]) =>
    (await s.as.owner.mutation(api.release.createPushKey, { site: 'restaurant', label: 'CI', scopes })).key

  it('a release key reads the state and releases over HTTP', async () => {
    const s = await setup()
    const token = await keyFor(s, ['release'])
    const state = await get(s, token)
    expect(state.status).toBe(200)
    expect(await state.json()).toMatchObject({ site: 'restaurant', schemaRev: 1, contentRev: 1 })

    const schema = copy(await storedSchema(s))
    schema.bricks.hours!.label = 'Öffnungszeiten neu'
    const released = await post(s, token, { commit: 'abcdef1234567', expectedSchemaRev: 1, expectedContentRev: 1, schema, writes: [] })
    expect(released.status).toBe(200)
    expect(await released.json()).toEqual({ schemaRev: 2, contentRev: 1 })
  })

  it('answers the CLI in English, also for an error from the catalog', async () => {
    const s = await setup()
    const token = await keyFor(s, ['release'])
    const response = await post(s, token, { commit: 'abcdef1234567', expectedSchemaRev: 5, expectedContentRev: 1, schema: await storedSchema(s), writes: [] })
    expect(await response.json()).toMatchObject({ code: 'CHANGED_SINCE', message: 'The schema has changed in the meantime. Please try again.' })
    expect(await (await get(s, 'ginko_restaurant_wrong')).json()).toMatchObject({ code: 'UNAUTHORIZED', message: 'The key is missing or invalid.' })
  })

  it('a name starting with $ in the body is INVALID, not an internal error (F17)', async () => {
    const s = await setup()
    const token = await keyFor(s, ['release'])
    const schema = copy(await storedSchema(s))
    const response = await post(s, token, { commit: 'abcdef1234567', expectedSchemaRev: 1, expectedContentRev: 1, schema, writes: [{ entry: s.entries.hours, fields: { exceptions: [{ $x: 1 }] } }] })
    expect([response.status, ((await response.json()) as { code: string }).code]).toEqual([400, 'INVALID'])
  })

  it('an operator finds a key by its label and revokes it', async () => {
    const s = await setup()
    const token = await keyFor(s, ['release'])
    const [listed] = await s.t.query(internal.release.pushKeys, { site: 'restaurant' })
    expect(listed).toMatchObject({ label: 'CI', scopes: ['release'], revokedAt: null })
    expect(listed).not.toHaveProperty('hash')
    await s.t.mutation(internal.release.revokePushKeyAsOperator, { key: listed!.id })
    expect((await get(s, token)).status).toBe(401)
  })

  it('a revoked or unknown key is 401', async () => {
    const s = await setup()
    const token = await keyFor(s, ['release'])
    const created = await s.as.owner.mutation(api.release.createPushKey, { site: 'restaurant', label: 'alt', scopes: ['release'] })
    await s.as.owner.mutation(api.release.revokePushKey, { site: 'restaurant', key: created.id })
    const revoked = await get(s, created.key)
    expect(revoked.status).toBe(401)
    expect((await revoked.json()) as object).toMatchObject({ code: 'UNAUTHORIZED' })
    expect((await get(s, 'ginko_restaurant_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(401)
    expect((await get(s, token)).status).toBe(200)
  })

  it('a key without the release scope is 403, and a check key may read but not release', async () => {
    const s = await setup()
    const pull = await keyFor(s, ['pull'])
    expect((await get(s, pull)).status).toBe(403)
    const check = await keyFor(s, ['check'])
    expect((await get(s, check)).status).toBe(200)
    const released = await post(s, check, { commit: 'x', expectedSchemaRev: 1, expectedContentRev: 1, schema: await storedSchema(s), writes: [] })
    expect(released.status).toBe(403)
    expect(await released.json()).toMatchObject({ code: 'FORBIDDEN' })
  })

  it('a key of another site is 403 for the restaurant', async () => {
    const s = await setup()
    const other = (await s.as.stranger.mutation(api.release.createPushKey, { site: 'andere', label: 'fremd', scopes: ['release'] })).key
    const state = await get(s, other)
    expect(state.status).toBe(403)
    expect(await state.json()).toMatchObject({ code: 'FORBIDDEN' })
  })

  it('a stale release is 409 and a rejected schema is 400 with its reasons', async () => {
    const s = await setup()
    const token = await keyFor(s, ['release'])
    const stale = await post(s, token, { commit: 'x1', expectedSchemaRev: 0, expectedContentRev: 1, schema: await storedSchema(s), writes: [] })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: 'CHANGED_SINCE' })

    const schema = copy(await storedSchema(s))
    delete schema.bricks.hours!.fields.closedNote
    const rejected = await post(s, token, { commit: 'x2', expectedSchemaRev: 1, expectedContentRev: 1, schema, writes: [] })
    expect(rejected.status).toBe(400)
    expect(await rejected.json()).toMatchObject({ code: 'SCHEMA_REJECTED', details: { rejected: [expect.objectContaining({ path: 'hours.closedNote' })] } })
  })

  it('a malformed schema or write is 400 INVALID, never a 500 (break-it)', async () => {
    const s = await setup()
    const token = await keyFor(s, ['release'])
    const base = { commit: 'x3', expectedSchemaRev: 1, expectedContentRev: 1, schema: await storedSchema(s), writes: [] }
    for (const body of [{ ...base, schema: {} }, { ...base, writes: [{ entry: 'e1', fields: [] }] }]) {
      const response = await post(s, token, body)
      expect([response.status, ((await response.json()) as { code: string }).code]).toEqual([400, 'INVALID'])
    }
  })
})

describe('devPush (SPEC 5.3)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is refused without GINKO_LOCAL=1', async () => {
    vi.stubEnv('GINKO_LOCAL', '')
    const s = await setup()
    const schema = copy(await storedSchema(s))
    schema.bricks.hours!.label = 'lokal'
    expect(await errorOf(s.t.mutation(internal.release.devPush, { site: 'restaurant', schema }))).toMatchObject({ code: 'FORBIDDEN' })
    expect((await storedSite(s)).schemaRev).toBe(1)
  })

  it('stores a changed schema locally and lets a rejected change through with a warning', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    const schema = copy(await storedSchema(s))
    delete schema.bricks.hours!.fields.closedNote
    const pushed = await s.t.mutation(internal.release.devPush, { site: 'restaurant', schema })
    expect(pushed).toMatchObject({ schemaRev: 2, warnings: [expect.objectContaining({ path: 'hours.closedNote' })] })
    expect((await storedSite(s)).schemaRev).toBe(2)
  })
})

describe('release regressions (Phase 5 review)', () => {
  const PHOTO_MIGRATION = { id: '2026-11-menu-photo', brick: 'menu', fills: 'photo', fingerprint: sha256('menu-photo') }

  /** A new optional file field on menu, filled by PHOTO_MIGRATION. */
  function withPhoto(schema: Schema): Schema {
    const next = copy(schema)
    next.bricks.menu!.fields.photo = { type: 'file', label: 'Foto', accept: ['pdf'], maxSize: 1024 * 1024, optional: true }
    next.migrations.push(PHOTO_MIGRATION)
    return next
  }

  /** A `ready` PDF upload of the restaurant. */
  const readyPdf = (s: Setup) => upload(s, { name: 'foto.pdf', content: '%PDF-1.4 foto' })

  /** One write per menu entry, deleted ones too, with the given fields. */
  async function menuWrites(s: Setup, fields: Record<string, Json>): Promise<Write[]> {
    return (await rowsOf(s, 'menu')).map((e) => ({ entry: e._id, fields }))
  }

  it('a file that a migration writes into an entry is referenced by that entry', async () => {
    const s = await setup()
    const photo = await readyPdf(s)
    await release(s, { schema: withPhoto(await storedSchema(s)), writes: await menuWrites(s, { photo: { file: photo } }) })
    const refs = await s.t.run((ctx) => ctx.db.query('fileRefs').withIndex('by_file', (q) => q.eq('file', photo)).collect())
    expect(refs.map((r) => r.holderId).sort()).toEqual((await rowsOf(s, 'menu')).map((e) => e._id).sort())
  })

  it('a migration cannot write a file of another site into an entry', async () => {
    const s = await setup()
    const foreign = await upload(s, { person: 'stranger', site: 'andere', name: 'foto.pdf', content: '%PDF-1.4 fremd' })
    const schema = withPhoto(await storedSchema(s))
    const error = await errorOf(release(s, { schema, writes: await menuWrites(s, { photo: { file: foreign } }) }))
    expect(error).toMatchObject({ code: 'INVALID' })
    expect((await storedSite(s)).schemaRev).toBe(1)
  })

  // The server enforces the file field's own `accept` and `maxSize`, not only the editor (fileProblem).
  it.each([
    { case: 'a PNG in a PDF field', file: { type: 'image/png', name: 'foto.png', content: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }, message: 'Dieser Dateityp ist nicht erlaubt (erlaubt: PDF).' },
    { case: 'a PDF over maxSize', file: { name: 'gross.pdf', content: `%PDF-1.4 ${'x'.repeat(1024 * 1024)}` }, message: 'Die Datei ist zu groß (höchstens 1 MB).' },
  ])('refuses $case in a file field and writes nothing', async ({ file, message }) => {
    const s = await setup()
    const photo = await upload(s, { ...file, ready: false })
    await s.t.mutation(internal.uploads.markFileReady, { upload: photo })
    const error = await errorOf(release(s, { schema: withPhoto(await storedSchema(s)), writes: await menuWrites(s, { photo: { file: photo } }) }))
    expect(error).toMatchObject({ code: 'INVALID', message })
    expect((await storedSite(s)).schemaRev).toBe(1)
  })

  it('a file already in a lenient file field is refused when a stricter field of the same entry takes it', async () => {
    const s = await setup()
    const big = await upload(s, { name: 'gross.pdf', content: `%PDF-1.4 ${'x'.repeat(1024 * 1024)}`, ready: false })
    await s.t.mutation(internal.uploads.markFileReady, { upload: big })
    const lenient = copy(await storedSchema(s))
    lenient.bricks.menu!.fields.doc = { type: 'file', label: 'Dokument', accept: ['pdf'], maxSize: 10 * 1024 * 1024, optional: true }
    lenient.migrations.push({ id: '2026-11-menu-doc', brick: 'menu', fills: 'doc', fingerprint: sha256('menu-doc') })
    await release(s, { schema: lenient, writes: await menuWrites(s, { doc: { file: big } }) })
    const error = await errorOf(release(s, { schema: withPhoto(lenient), writes: await menuWrites(s, { photo: { file: big } }) }))
    expect(error).toMatchObject({ code: 'INVALID', message: 'Die Datei ist zu groß (höchstens 1 MB).' })
    expect((await storedSite(s)).schemaRev).toBe(2)
  })

  it('a release keeps entryCount at the live entries plus the created singles', async () => {
    const s = await setup()
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.entries['menu-schnitzel']!, { deletedAt: Date.now() })
      await ctx.db.patch(s.site, { entryCount: Object.keys(s.entries).length - 1 })
    })
    const schema = copy(await storedSchema(s))
    schema.bricks.parking = {
      kind: 'single', label: 'Parken',
      fields: { phone: { type: 'text', label: 'Telefon', format: 'tel', translate: false, default: '+43 1 000 000' } },
    }
    await release(s, { schema })
    expect((await storedSite(s)).entryCount).toBe(Object.keys(s.entries).length)
  })

  it('a migration dropped from the config keeps its identity: same descriptor is skipped, changed one is MIGRATION_CHANGED', async () => {
    const s = await setup()
    const dropped = async () => {
      const schema = copy(await storedSchema(s))
      schema.migrations = []
      await release(s, { schema })
    }
    await release(s, { schema: withSubtitle(await storedSchema(s)), writes: await subtitleWrites(s) })
    await dropped()
    // The same descriptor again: nothing is new, so no write and no second ledger row.
    await release(s, { schema: withSubtitle(await storedSchema(s)) })
    expect(await s.t.run((ctx) => ctx.db.query('migrationsApplied').collect())).toHaveLength(1)

    await dropped()
    // The same ID with another target and fingerprint is a changed migration.
    const changed = copy(await storedSchema(s))
    changed.bricks.menu!.fields.tagline = { type: 'text', label: 'Slogan', max: 200, translate: false }
    changed.migrations.push({ id: SUBTITLE_MIGRATION.id, brick: 'menu', fills: 'tagline', fingerprint: sha256('other source') })
    const error = await errorOf(release(s, { schema: changed, writes: await menuWrites(s, { tagline: 'Slogan' }) }))
    expect(error).toMatchObject({ code: 'MIGRATION_CHANGED' })
    expect(await s.t.run((ctx) => ctx.db.query('migrationsApplied').collect())).toHaveLength(1)
  })
})

describe('devPush on a fresh local backend', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('creates the site from the pushed schema when it does not exist yet', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    const schema = { ...copy(await storedSchema(s)), site: 'neu', name: 'Neue Seite' }
    expect(await s.t.mutation(internal.release.devPush, { site: 'neu', schema })).toMatchObject({ schemaRev: 1, warnings: [] })
    const created = await s.t.run((ctx) => ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', 'neu')).unique())
    expect(created).toMatchObject({ name: 'Neue Seite', schemaRev: 1, entryCount: 6 })
  })

  it('creates one entry for every single brick, so the owner can save the hours at once', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    const schema = { ...copy(await storedSchema(s)), site: 'neu', name: 'Neue Seite' }
    await s.t.mutation(internal.release.devPush, { site: 'neu', schema })
    const site = (await s.t.run((ctx) => ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', 'neu')).unique()))!
    await s.t.run((ctx) => ctx.db.insert('memberships', { site: site._id, user: people.owner, role: 'owner', grants: [] }))
    const singles = (await s.t.run((ctx) => ctx.db.query('entries').collect())).filter((e) => e.site === site._id)
    expect(singles.map((e) => e.brick).sort()).toEqual(['contact', 'gallery', 'hours', 'legal', 'lunch', 'seo'])
    expect(site.entryCount).toBe(6)
    expect(site.orderRevs.hours).toBe(1)
    const hours = singles.find((e) => e.brick === 'hours')!
    expect(await s.as.owner.mutation(api.entries.save, { site: 'neu', opId: opId(), entry: hours._id, baseRev: 1, fields: { closedNote: { de: 'Betriebsurlaub' } }, sentence: 'Hinweis gesetzt' }))
      .toMatchObject({ rev: 2 })
  })
})

describe('release candidate (break-it 9)', () => {
  it('a new required list column with a default fills every existing row', async () => {
    const s = await setup()
    const schema = copy(await storedSchema(s))
    const exceptions = schema.bricks.hours!.fields.exceptions as { of: Record<string, unknown> }
    exceptions.of.public = { type: 'boolean', label: 'Öffentlich', default: true }
    await release(s, { schema })
    const [hours] = await rowsOf(s, 'hours')
    const rows = hours!.data.exceptions as { public?: boolean }[]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.public === true)).toBe(true)
  })

  it('a migration that writes nothing into a new required field is refused, also for unchanged entries', async () => {
    const s = await setup()
    const writes = (await rowsOf(s, 'menu')).map((e) => ({ entry: e._id, fields: { subtitle: null } }))
    const error = await errorOf(release(s, { schema: withSubtitle(await storedSchema(s)), writes }))
    expect(error).toMatchObject({ code: 'INVALID' })
  })

  it('a migration cannot put a PDF into an image field', async () => {
    const s = await setup()
    const pdf = await upload(s)
    const schema = copy(await storedSchema(s))
    schema.bricks.menu!.fields.photo = { type: 'image', label: 'Foto', optional: true }
    schema.migrations.push({ id: '2026-12-menu-photo', brick: 'menu', fills: 'photo', fingerprint: sha256('menu-photo') })
    const writes = (await rowsOf(s, 'menu')).map((e) => ({ entry: e._id, fields: { photo: { file: pdf, alt: { de: 'Foto' } } } }))
    expect(await errorOf(release(s, { schema, writes }))).toMatchObject({ code: 'INVALID', message: 'Diese Datei ist kein Bild.' })
  })

  it.each([Number.NaN, -1, 0.5])('expected revisions must be whole numbers (%s)', async (rev) => {
    const s = await setup()
    expect(await errorOf(release(s, { schema: await storedSchema(s), expectedSchemaRev: rev }))).toMatchObject({ code: 'INVALID' })
  })

  it('the release carries the config name and URL to the site', async () => {
    const s = await setup()
    const schema = { ...copy(await storedSchema(s)), name: 'Gasthaus Linde', url: 'https://linde.example' }
    await release(s, { schema })
    expect(await storedSite(s)).toMatchObject({ name: 'Gasthaus Linde', url: 'https://linde.example' })
  })
})
