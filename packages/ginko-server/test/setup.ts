// Shared convex-test setup: the restaurant site from the contracts corpus, with its people.
// Every platform test starts here, so no test writes its own seed.
import type { Json } from '@lupinum/ginko'
import { serializeSchema, type Schema } from '@lupinum/ginko/internal'
import { convexTest } from 'convex-test'
import type { UserIdentityAttributes } from 'convex/server'
import restaurant from '../../../sites/restaurant/ginko.config.ts'
import corpus from '../../../contracts/restaurant/data.json' with { type: 'json' }
import { api, components, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import schema from '../convex/schema'
import betterAuthSchema from '../convex/betterAuth/schema'

const modules = import.meta.glob(['../convex/**/*.*s', '!../convex/**/*.test.ts', '!../convex/betterAuth/**'])
// The Better Auth component (convex/betterAuth) that `auth.getUser` queries for the live session.
const betterAuthModules = import.meta.glob(['../convex/betterAuth/**/*.*s'])

export const people = {
  admin: 'u-admin',
  /** Die Wirtin. */
  owner: 'u-wirtin',
  /** Der Koch: staff with the grants of SPEC 13. */
  cook: 'u-koch',
  /** Owner of another site, no access to the restaurant. */
  stranger: 'u-fremd',
} as const

type Person = keyof typeof people

/**
 * Every Better Auth account that signs in during tests, with the email its session carries.
 * `neu` and `anders` are the invitee and outsider of invites.accept tests: signed in, no membership.
 */
const accounts = [
  { id: people.admin, email: 'admin@example.com' },
  { id: people.owner, email: 'wirtin@example.com' },
  { id: people.cook, email: 'koch@example.com' },
  { id: people.stranger, email: 'fremd@example.com' },
  { id: 'u-neu', email: 'neu@example.com' },
  { id: 'u-anders', email: 'anders@example.com' },
] as const

/** The Better Auth session row of a user. A session is live until its row is deleted. */
const sessionIdOf = (userId: string) => `s-${userId}`

/** The Convex identity a live Better Auth session produces: `subject` is the user id, `sid` the session id. */
function signedIn<R>(t: { withIdentity: (identity: UserIdentityAttributes) => R }, userId: string): R {
  const account = accounts.find((a) => a.id === userId)!
  return t.withIdentity({ subject: userId, token_use: 'convex-session', sid: sessionIdOf(userId), email: account.email })
}

export const cookGrants = ['menu.edit', 'menu.price', 'menu.add', 'menu.remove', 'lunch.lunchWeek']

type CorpusEntry = { id: string; order?: number; data: Record<string, Json>; prints?: Record<string, Record<string, string>> }

/**
 * A fresh backend with:
 * - site `restaurant` (schema from sites/restaurant, entries from contracts/restaurant/data.json)
 * - site `andere` (same schema, no entries) owned by the stranger
 * Returns the clients per person and a map corpus id → Convex entry id.
 */
export async function setup() {
  const t = convexTest(schema, modules)
  t.registerComponent('betterAuth', betterAuthSchema, betterAuthModules)
  // Raw `t.withIdentity({ subject, email })` calls in tests are signed-in users too: the
  // session claims are added here, so they resolve to the live session like `as.<person>`.
  const withIdentity = t.withIdentity.bind(t)
  t.withIdentity = (claims) => withIdentity({ token_use: 'convex-session', sid: sessionIdOf(String(claims.subject)), ...claims })
  const siteSchema: Schema = serializeSchema(restaurant)
  // Better Auth users and live sessions go through the component's own create, so the
  // generation fields that admission checks are set the same way as in production.
  for (const account of accounts) {
    const now = Date.now()
    await t.mutation(components.betterAuth.adapter.create, {
      model: 'user',
      data: { id: account.id, name: account.id, email: account.email, emailVerified: true, image: null, createdAt: now, updatedAt: now },
    })
    await t.mutation(components.betterAuth.adapter.create, {
      model: 'session',
      data: { id: sessionIdOf(account.id), token: `token-${account.id}`, userId: account.id, expiresAt: now + 24 * 60 * 60 * 1000, createdAt: now, updatedAt: now, ipAddress: null, userAgent: null },
    })
  }
  const seeded = await t.run(async (ctx) => {
    const blank = { url: siteSchema.url, previewOrigins: ['http://localhost:3100'], schema: siteSchema, schemaRev: 1, contentRev: 1, entryCount: 0, bytes: 0, release: null }
    const site = await ctx.db.insert('sites', { ...blank, slug: 'restaurant', name: siteSchema.name })
    const other = await ctx.db.insert('sites', { ...blank, slug: 'andere', name: 'Andere Seite' })
    await ctx.db.insert('admins', { user: people.admin })
    await ctx.db.insert('memberships', { site, user: people.owner, email: 'wirtin@example.com', role: 'owner', grants: [] })
    await ctx.db.insert('memberships', { site, user: people.cook, email: 'koch@example.com', role: 'staff', grants: cookGrants })
    await ctx.db.insert('memberships', { site: other, user: people.stranger, email: 'fremd@example.com', role: 'owner', grants: [] })

    const entries: Record<string, Id<'entries'>> = {}
    let bytes = 0
    let count = 0
    for (const [brick, rows] of Object.entries(corpus as Record<string, CorpusEntry[]>)) {
      const def = siteSchema.bricks[brick]!
      for (const [index, row] of rows.entries()) {
        const size = new TextEncoder().encode(JSON.stringify(row.data)).byteLength
        const fieldRevs = Object.fromEntries(Object.keys(def.fields).map((f) => [f, 1]))
        const id = await ctx.db.insert('entries', {
          site, brick, kind: def.kind === 'single' ? 'single' : 'item', order: row.order ?? index + 1,
          data: row.data, rev: 1, fieldRevs, lifeRev: 1, prints: row.prints ?? {}, bytes: size,
        })
        entries[row.id] = id
        bytes += size
        count++
        // Slugs of routed entries, one row per locale (SPEC 3).
        for (const [name, field] of Object.entries(def.fields)) {
          if (field.type !== 'slug') continue
          for (const [locale, slug] of Object.entries((row.data[name] ?? {}) as Record<string, string>)) {
            await ctx.db.insert('slugs', { site, brick, locale, slug, entry: id })
          }
        }
      }
    }
    await ctx.db.patch(site, { bytes, entryCount: count })
    return { site, other, entries }
  })
  return {
    t,
    ...seeded,
    as: {
      admin: signedIn(t, people.admin),
      owner: signedIn(t, people.owner),
      cook: signedIn(t, people.cook),
      stranger: signedIn(t, people.stranger),
      anonymous: t,
    },
  }
}

type Backend = Awaited<ReturnType<typeof setup>>['t']

/** Ends the person's Better Auth session, as sign-out or revocation does. Their calls fail from then on. */
export async function revokeSession(t: Backend, person: Person) {
  await t.mutation(components.betterAuth.adapter.deleteOne, { model: 'session', where: [{ field: 'id', value: sessionIdOf(people[person]) }] })
}

/** A fresh op id per user action. */
export const opId = () => crypto.randomUUID()

/**
 * Every exported public query, mutation and action of convex/, as `module.name`, sorted. The access tests compare their
 * call lists with it, so a new public function cannot ship without a probe. `*.config.ts` registers no function.
 */
export async function publicFunctions(): Promise<string[]> {
  const out: string[] = []
  for (const [path, load] of Object.entries(modules)) {
    if (path.endsWith('.config.ts')) continue
    const module = path.slice('../convex/'.length).replace(/\.[jt]s$/, '')
    for (const [name, value] of Object.entries(await load() as Record<string, unknown>)) {
      const fn = value as { isPublic?: boolean; isQuery?: boolean; isMutation?: boolean; isAction?: boolean }
      if (typeof value === 'function' && fn.isPublic && (fn.isQuery || fn.isMutation || fn.isAction)) out.push(`${module}.${name}`)
    }
  }
  return out.sort()
}

/** Reads the ConvexError data of a rejected call: `{ code, message, details? }`. */
export async function errorOf(call: Promise<unknown>): Promise<{ code: string; message: string; details?: unknown }> {
  try {
    await call
  } catch (error) {
    const data = (error as { data?: unknown }).data
    if (data && typeof data === 'object' && 'code' in data) return data as { code: string; message: string }
    throw error
  }
  throw new Error('expected the call to fail')
}

type Setup = Awaited<ReturnType<typeof setup>>

/** POST /upload with a fresh ticket of `person` (SPEC 4.3). Returns the response. */
export async function postUpload(s: Setup, opts: { person?: Person; site?: string; content?: Uint8Array | string; type?: string; name?: string; ticket?: string } = {}) {
  const { person = 'owner', site = 'restaurant', content = '%PDF-1.4 karte', type = 'application/pdf', name = 'karte.pdf' } = opts
  const ticket = opts.ticket ?? (await s.as[person].mutation(api.uploads.prepare, { site })).ticket
  return s.t.fetch(`/upload?ticket=${encodeURIComponent(ticket)}&name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': type }, body: content })
}

/**
 * A file as the browser leaves it (SPEC 4.3): a ticket of `person` (a member of `site`), the upload
 * through the route, and with `ready` the check step's result, as uploadsNode does for a PDF.
 */
export async function upload(s: Setup, opts: { person?: Person; site?: string; content?: Uint8Array | string; type?: string; name?: string; ready?: boolean } = {}) {
  const { type = 'application/pdf', ready = true } = opts
  const response = await postUpload(s, opts)
  const body = (await response.json()) as { upload?: string; code?: string; message?: string }
  if (!response.ok || !body.upload) throw Object.assign(new Error(body.message), { data: body })
  const id = body.upload as Id<'uploads'>
  if (ready && type === 'application/pdf') await s.t.mutation(internal.uploads.markFileReady, { upload: id })
  return id
}
