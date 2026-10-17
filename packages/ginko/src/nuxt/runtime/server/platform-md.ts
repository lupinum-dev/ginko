/// <reference path="../schema.d.ts" />
// `/__ginko/platform/<locale>/<rev>/md/<brick>/<id>/<field>.json`: one markdown tree of a platform brick, the
// `{ ref }` the page state holds (runtime/plugin.ts). <GinkoMarkdown> loads it on a client navigation.
// A platform failure is a 503 (fetch.ts); a revision the platform has not reached is a 404, like an unknown text.
import { createError, defineEventHandler, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import schema from '#ginko/schema'
import { platformMarkdownRef, withMarkdownRefs, type Locale, type MarkdownTree } from '../../../internal.ts'
import { fetchBundle, PlatformError } from '../fetch.ts'
import type { GinkoPublicConfig } from '../shared.ts'

const PATH = /^\/__ginko\/platform\/([^/]+)\/(\d+\.\d+)\/md\//

/** The platform's trees of one locale, under the revision the platform answered with. */
type Copy = { rev: string; trees: Map<string, MarkdownTree> }

// One copy per locale. A page that loads several texts (one request each) costs one platform fetch, and a ref of
// an older revision is answered from the newer copy, so the rev in the path makes a time limit unnecessary. The
// copy stays until a newer one has arrived: a failed fetch never takes it away.
const copies = new Map<Locale, Copy>()
// At most one platform fetch per locale at a time; requests that need a newer copy wait for it.
const flights = new Map<Locale, Promise<Copy>>()
// The rev in the path comes from the visitor's URL. A rev the platform has not reached (409) answers 404 for a
// short time without asking again, so a made-up URL cannot make the site fetch whole bundles per request.
const ahead = new Map<Locale, { rev: string; until: number }>()
const AHEAD_MS = 10_000

const newer = (a: string, b: string) => {
  const [as = 0, ac = 0] = a.split('.').map(Number)
  const [bs = 0, bc = 0] = b.split('.').map(Number)
  return as !== bs ? as > bs : ac > bc
}

const stale = (error: unknown) => error instanceof PlatformError && error.platformStatus === 409

function covering(locale: Locale, rev: string): Copy | undefined {
  const copy = copies.get(locale)
  return copy && !newer(rev, copy.rev) ? copy : undefined
}

function isAhead(locale: Locale, rev: string): boolean {
  const known = ahead.get(locale)
  return !!known && known.until > Date.now() && !newer(known.rev, rev)
}

/** The running fetch of this locale, or a new one with `rev` as minRev (the platform answers it or a newer one). */
function flightFor(config: GinkoPublicConfig, locale: Locale, rev: string): Promise<Copy> {
  const running = flights.get(locale)
  if (running) return running
  const siteToken = useRuntimeConfig().ginkoRevalidateToken as string | undefined
  const copy = fetchBundle(config, locale, rev, siteToken).then((bundle) => {
    const actual = `${bundle.schemaRev}.${bundle.contentRev}`
    const trees = new Map<string, MarkdownTree>()
    withMarkdownRefs(bundle, schema, trees, (brick, id, field) => platformMarkdownRef(locale, actual, brick, id, field))
    const fresh = { rev: actual, trees }
    const current = copies.get(locale)
    if (!current || newer(actual, current.rev)) copies.set(locale, fresh)
    return fresh
  }, (error: unknown) => {
    if (stale(error)) ahead.set(locale, { rev, until: Date.now() + AHEAD_MS })
    throw error
  }).finally(() => flights.delete(locale))
  flights.set(locale, copy)
  return copy
}

/** The copy that holds revision `rev` or a newer one; `undefined` when the platform has not reached `rev`. */
async function copyFor(config: GinkoPublicConfig, locale: Locale, rev: string): Promise<Copy | undefined> {
  // Two rounds: a request may join a fetch that another request started for another revision.
  for (let round = 0; round < 2; round++) {
    const copy = covering(locale, rev)
    if (copy) return copy
    if (isAhead(locale, rev)) return undefined
    try {
      await flightFor(config, locale, rev)
    } catch (error) {
      // A 409 is "not there yet" for that fetch's revision; the next round decides for this one.
      if (!stale(error)) throw error
    }
  }
  return covering(locale, rev)
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const path = getRequestURL(event).pathname
  const [, locale = '', rev = ''] = PATH.exec(path) ?? []
  if (!config.locales.includes(locale)) throw createError({ statusCode: 404, statusMessage: 'Text not found' })
  let copy: Copy | undefined
  try {
    copy = await copyFor(config, locale, rev)
  } catch (error) {
    if (error instanceof PlatformError) throw createError({ statusCode: error.statusCode, statusMessage: error.message, cause: error.cause })
    throw error
  }
  // The copy may hold a newer revision than the page asked for: look the text up under that revision's path.
  const tree = copy?.trees.get(path.replace(PATH, `/__ginko/platform/${locale}/${copy.rev}/md/`))
  if (!tree) throw createError({ statusCode: 404, statusMessage: 'Text not found' })
  return tree
})
