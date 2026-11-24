// `ginko connect`: a device authorization flow that gives a website folder a publishing key without anyone copying it.
// 1. The computer opens a request (routes/connect.ts → `open`): the device code goes back to it once, only its SHA-256
//    is stored; the short user code is shown in its terminal.
// 2. A signed-in owner or admin types that code in the Studio (`lookup`), picks a site and confirms (`approve`) or
//    declines (`decline`). The approval stores who, which site and when. It makes no key.
// 3. The computer's next poll with the device code (`redeem`) makes the key in that same transaction, marks the
//    request used and returns the key once. Every request that cannot give a key answers the same "not valid".
// Wrong codes count per person: after 5 in a fixed 10-minute window, the rest of that window is refused.
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { internalMutation, mutation, type MutationCtx } from './_generated/server'
import { currentUser, memberOf } from './lib/access'
import { insertPushKey, ownerOf, PUBLISHING_SCOPES } from './release'

export const CONNECT = {
  lifetimeMs: 10 * 60_000,
  intervalSeconds: 2,
  /** Pending requests in the whole deployment; `start` is public and the backend sees no trusted client IP. */
  maxPending: 200,
  wrongCodes: 5,
  windowMs: 10 * 60_000,
  labelMax: 60,
} as const

/** No 0/O, 1/I/L. 31 symbols, 8 of them: about 8.5 × 10¹¹ codes against 5 guesses per person and window. */
export const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const USER_CODE = new RegExp(`^[${USER_CODE_ALPHABET}]{8}$`)

/** What a person typed (any case, with or without the hyphen or spaces) as the stored form, or undefined. */
export function normalizeCode(input: string): string | undefined {
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  return USER_CODE.test(code) ? code : undefined
}

/** Deletes up to `limit` requests whose lifetime ended. Returns how many. */
export async function dropExpired(ctx: MutationCtx, now: number, limit: number): Promise<number> {
  const rows = await ctx.db.query('connectRequests').withIndex('by_expires', (q) => q.lt('expiresAt', now)).take(limit)
  for (const row of rows) await ctx.db.delete(row._id)
  return rows.length
}

/**
 * Stores a new request. The HTTP route made both codes (an action has real randomness) and sends only the device
 * code's hash. Refuses when 200 requests are pending; removes up to 20 expired rows first, so the table cannot grow.
 */
export const open = internalMutation({
  args: { deviceHash: v.string(), userCode: v.string(), label: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; expiresAt: number } | { ok: false; reason: 'full' | 'taken' }> => {
    const now = Date.now()
    await dropExpired(ctx, now, 20)
    const pending = await ctx.db.query('connectRequests').withIndex('by_state_expires', (q) => q.eq('state', 'pending').gt('expiresAt', now)).take(CONNECT.maxPending)
    if (pending.length >= CONNECT.maxPending) return { ok: false, reason: 'full' }
    const same = await ctx.db.query('connectRequests').withIndex('by_code', (q) => q.eq('userCode', args.userCode)).collect()
    if (same.some((row) => row.expiresAt > now)) return { ok: false, reason: 'taken' }
    const expiresAt = now + CONNECT.lifetimeMs
    await ctx.db.insert('connectRequests', { deviceHash: args.deviceHash, userCode: args.userCode, label: args.label, expiresAt, state: 'pending' })
    return { ok: true, expiresAt }
  },
})

type Refused = { ok: false; reason: 'invalid' | 'limited' }

const windowOf = (now: number) => Math.floor(now / CONNECT.windowMs) * CONNECT.windowMs

/**
 * The live, pending request of a typed code for this person, or why not. A wrong code is counted; at 5 wrong codes in
 * the window every further attempt is refused, a right code too. The caller must not throw after a refusal: a thrown
 * error would roll the count back.
 */
async function pendingFor(ctx: MutationCtx, user: string, typed: string): Promise<Doc<'connectRequests'> | Refused> {
  const now = Date.now()
  const window = windowOf(now)
  const tries = await ctx.db.query('connectTries').withIndex('by_user_window', (q) => q.eq('user', user).eq('window', window)).unique()
  if (tries && tries.count >= CONNECT.wrongCodes) return { ok: false, reason: 'limited' }
  const code = normalizeCode(typed)
  const rows = code ? await ctx.db.query('connectRequests').withIndex('by_code', (q) => q.eq('userCode', code)).collect() : []
  const live = rows.find((row) => row.state === 'pending' && row.expiresAt > now)
  if (live) return live
  if (tries) await ctx.db.patch(tries._id, { count: tries.count + 1 })
  else await ctx.db.insert('connectTries', { user, window, count: 1 })
  return { ok: false, reason: 'invalid' }
}

/** Step 2a: the typed code names a request. Shows its label and when it started, before the person picks a site. */
export const lookup = mutation({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; label: string; startedAt: number } | Refused> => {
    const user = await currentUser(ctx)
    const request = await pendingFor(ctx, user.id, args.code)
    if ('ok' in request) return request
    return { ok: true, label: request.label, startedAt: request.expiresAt - CONNECT.lifetimeMs }
  },
})

/** Step 2b: confirm. Needs the right `release.createPushKey` needs on that site. Stores the approval, makes no key. */
export const approve = mutation({
  args: { code: v.string(), site: v.string() },
  handler: async (ctx, args): Promise<{ ok: true } | Refused> => {
    const user = await currentUser(ctx)
    const request = await pendingFor(ctx, user.id, args.code)
    if ('ok' in request) return request
    const actor = await ownerOf(ctx, args.site)
    await ctx.db.patch(request._id, { state: 'approved', site: actor.site._id, approvedBy: actor.user.id, approvedAt: Date.now() })
    return { ok: true }
  },
})

/** Step 2b: decline. The computer's next poll then answers "not valid". */
export const decline = mutation({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<{ ok: true } | Refused> => {
    const user = await currentUser(ctx)
    const request = await pendingFor(ctx, user.id, args.code)
    if ('ok' in request) return request
    await ctx.db.patch(request._id, { state: 'declined' })
    return { ok: true }
  },
})

/**
 * Step 3: a poll with the device code's hash. An approved request becomes a publishing key here, with the scopes and
 * storage of a Team-page key, created by the approver; the request is used and the key returned once. The approver
 * must still hold the right. Unknown, expired, declined and used requests give the same answer.
 */
export const redeem = internalMutation({
  args: { deviceHash: v.string() },
  handler: async (ctx, args): Promise<{ state: 'pending' } | { state: 'invalid' } | { state: 'connected'; site: string; key: string }> => {
    const row = await ctx.db.query('connectRequests').withIndex('by_device', (q) => q.eq('deviceHash', args.deviceHash)).unique()
    if (!row || row.expiresAt <= Date.now()) return { state: 'invalid' }
    if (row.state === 'pending') return { state: 'pending' }
    if (row.state !== 'approved' || !row.site || !row.approvedBy) return { state: 'invalid' }
    const site = await ctx.db.get(row.site)
    const actor = site ? await memberOf(ctx, site, { id: row.approvedBy }) : null
    if (!site || !actor || actor.role === 'staff') {
      await ctx.db.patch(row._id, { state: 'declined' })
      return { state: 'invalid' }
    }
    const label = `connect: ${row.label}`.slice(0, CONNECT.labelMax).trim()
    const { key } = await insertPushKey(ctx, site, { label, scopes: [...PUBLISHING_SCOPES], createdBy: row.approvedBy })
    await ctx.db.patch(row._id, { state: 'used' })
    return { state: 'connected', site: site.slug, key }
  },
})
