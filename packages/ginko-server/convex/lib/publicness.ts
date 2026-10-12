// "Why is this not public?" (SPEC 4.2 entries.whyNotPublic): every reason, in plain words, that an
// entry is missing on the website in one language. The rules are the ones the bundle applies
// (drafts, `isVisible`, `missing: 'hide'`, `urlsFor`); this only names them.
import { isVisible, todayIn, urlsFor, type Brick, type CollectionBrick, type Locale, type Schema } from '@lupinum/ginko'
import type { Doc } from '../_generated/dataModel'
import type { Data } from './content'
import { historyText, msg, type HistoryMsg } from './history'
import { DELETED_KEPT } from './lifecycle'
import { leafStatus } from './translation'

/** What the person can do about it; the Studio turns the id into a button. */
export type ReasonAction = 'restore' | 'publish' | 'edit' | 'translate' | 'release'

export interface Reason {
  code: 'deleted' | 'draft' | 'scheduled' | 'no_route' | 'not_visible' | 'translation_hidden' | 'translation_fallback' | 'not_released'
  /** The reason as catalog key plus params; the reader's language and the site's zone are applied where it is shown. */
  msg: HistoryMsg
  /** German rendering of `msg`, for agents and clients that do not translate. */
  sentence: string
  /** False: the entry still shows (e.g. in the main language instead of a missing translation). */
  blocking: boolean
  action?: ReasonAction
}

export interface Publicness {
  /** True when no reason blocks. Reasons that do not block are hints only. */
  public: boolean
  reasons: Reason[]
  /** Only for a public entry whose brick has a route in this language: the page, relative and absolute. */
  path?: string
  url?: string
}

export function publicness(site: Doc<'sites'>, key: string, row: Doc<'entries'>, locale: Locale): Publicness {
  const schema = site.schema as Schema
  const brick = schema.bricks[key]!
  const zone = schema.timezone
  const reasons: Reason[] = []
  const done = (): Publicness => ({ public: reasons.every((r) => !r.blocking), reasons })
  const reason = (code: Reason['code'], blocking: boolean, message: HistoryMsg, action?: ReasonAction): Reason =>
    ({ code, blocking, ...(action ? { action } : {}), msg: message, sentence: historyText(message, 'de', schema) })

  if (row.deletedAt) {
    reasons.push(reason('deleted', true, msg('publicness.deleted', { until: row.deletedAt + DELETED_KEPT }), 'restore'))
    return done()
  }
  if (row.state === 'draft') {
    reasons.push(row.publishAt === undefined
      ? reason('draft', true, msg('publicness.draft'), 'publish')
      : reason('scheduled', true, msg('publicness.scheduled', { at: row.publishAt, zone }), 'publish'))
  }
  const route = brick.kind === 'collection' ? brick.route?.[locale] : undefined
  if (!route) {
    reasons.push(reason('no_route', false, msg(brick.kind === 'collection' && brick.route ? 'publicness.noRouteLocale' : 'publicness.noRoute', { brick: brick.label })))
  }
  if (brick.kind === 'collection' && !isVisible(brick as Brick, row.data as Data, todayIn(zone))) {
    reasons.push(reason('not_visible', true, msg('publicness.notVisible'), 'edit'))
  }
  if (locale !== schema.locales[0]) {
    const status = leafStatus(schema, key, row, locale)
    if (status.missing.length || status.outdated.length) {
      const what = status.missing.length && status.outdated.length ? 'both' : status.missing.length ? 'missing' : 'outdated'
      reasons.push(status.hidden
        ? reason('translation_hidden', true, msg('publicness.translationHidden', { locale, what, brick: brick.label }), 'translate')
        : reason('translation_fallback', false, msg('publicness.translationFallback', { locale, what, main: schema.locales[0]! }), 'translate'))
    }
  }
  if (site.release === null) {
    reasons.push(reason('not_released', true, msg('publicness.notReleased'), 'release'))
  }

  const out = done()
  if (out.public && route) {
    const entry = { id: row._id, order: row.order, data: row.data as Data, prints: row.prints }
    const path = urlsFor(schema, key, brick as CollectionBrick, entry, () => undefined)[locale]
    if (path) return { ...out, path, url: `${schema.url.replace(/\/+$/, '')}${path}` }
  }
  return out
}
