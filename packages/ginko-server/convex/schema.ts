// Tables of the platform, SPEC part 3. Content shapes (`schema`, `data`, `before`/`after`)
// are v.any() on purpose: every write checks them with the one validator in
// @lupinum/ginko/core, so nothing unchecked gets in.
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const role = v.union(v.literal('owner'), v.literal('staff'))
/**
 * A history line as catalog key plus params (`HistoryMsg`, lib/history.ts), read in the reader's language.
 * Param values are text, numbers (dates in ms), labels per locale or nested messages: v.any() because
 * the type is recursive; every write builds them with `msg()`.
 */
const historyMsg = v.object({ key: v.string(), params: v.optional(v.record(v.string(), v.any())) })
const scope = v.union(v.literal('release'), v.literal('pull'), v.literal('check'), v.literal('export'))

export default defineSchema({
  sites: defineTable({
    slug: v.string(),
    name: v.string(),
    url: v.string(),
    previewOrigins: v.array(v.string()),
    schema: v.any(),
    schemaRev: v.number(),
    contentRev: v.number(),
    /** Unused since entries.move (one order value per move); `sites:dropOrderRevs` unsets it (internals/migrations.md). */
    orderRevs: v.optional(v.record(v.string(), v.number())),
    entryCount: v.number(),
    /** Budget bytes (core `entryBytes`) of the live entries, drafts included (SPEC 3). */
    bytes: v.number(),
    /**
     * Budget bytes of the removed entries in the trash; capped (SITE_BUDGET.trashBytes). Optional and
     * `treeBytes` too until `entries:migrateStorage` ran everywhere (internals/migrations.md).
     */
    trashBytes: v.optional(v.number()),
    /** Bytes of the live entries' Markdown trees (`entryTrees`); bounded by SITE_BUDGET.treeBytes so the bundle read stays in Convex's limits. */
    treeBytes: v.optional(v.number()),
    release: v.union(v.null(), v.object({ commit: v.string(), schemaRev: v.number(), contentRev: v.number(), at: v.number() })),
    /** Vercel bypass token of the site; never returned by a query. */
    refreshToken: v.optional(v.string()),
    /** Site setting for the agent door (SPEC 17): `true` makes agent writes proposals. Between the key's `review` and `agents.review` of the config. */
    agentReview: v.optional(v.boolean()),
    /** When the pending digest mail of open proposals goes out (ms); absent when none is scheduled. */
    digestAt: v.optional(v.number()),
    /** When the live site last proved it shows the current revision after a publish or an urgent refresh (ms). */
    lastRefreshAt: v.optional(v.number()),
    /**
     * Set when an owner or admin started the deletion: nobody opens the site except to cancel, the bundle answers as for an
     * unknown site and keys stop working. `at` is when `siteDeletion.purge` (the scheduled `job`) removes everything.
     */
    deleting: v.optional(v.object({ at: v.number(), job: v.id('_scheduled_functions') })),
    /** Set by `seed:importOpen` on an empty site while an operator loads an export folder into the hosted platform; `seed:importDone` clears it. */
    importOpen: v.optional(v.boolean()),
  }).index('by_slug', ['slug']),

  memberships: defineTable({
    site: v.id('sites'),
    user: v.string(),
    /** Normalized email of the accepted invite; shown in member lists. */
    email: v.optional(v.string()),
    role,
    grants: v.array(v.string()),
  }).index('by_user_site', ['user', 'site']).index('by_site', ['site']),

  invites: defineTable({
    site: v.id('sites'),
    email: v.string(),
    role,
    grants: v.array(v.string()),
    tokenHash: v.string(),
    invitedBy: v.string(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    /** The inviter's language: the invitee's mails until they have their own setting. */
    locale: v.optional(v.string()),
  }).index('by_tokenHash', ['tokenHash']).index('by_site', ['site']).index('by_email', ['email']).index('by_expires', ['expiresAt']),

  admins: defineTable({ user: v.string() }).index('by_user', ['user']),

  entries: defineTable({
    site: v.id('sites'),
    brick: v.string(),
    kind: v.union(v.literal('single'), v.literal('item')),
    order: v.number(),
    data: v.any(),
    rev: v.number(),
    fieldRevs: v.record(v.string(), v.number()),
    lifeRev: v.number(),
    /** Leaf path → locale → print of the main-language value at translation time. */
    prints: v.record(v.string(), v.record(v.string(), v.string())),
    /**
     * Legacy: the Markdown trees on the row itself. They live in `entryTrees` now; `entries:migrateStorage` moves
     * them, and the bundle still reads this until then (internals/migrations.md).
     */
    trees: v.optional(v.string()),
    /** Budget bytes: core `entryBytes(data, prints)`, the text without its trees. */
    bytes: v.number(),
    /** UTF-8 bytes of this entry's rows in `entryTrees`; 0 in the trash, which keeps no trees. */
    treeBytes: v.optional(v.number()),
    /**
     * When the entry last changed for the public (ms): a save of a live entry, its creation, going live, a restore.
     * The bundle's `updatedAt`. A draft's saves leave it alone; release migrations do too.
     */
    contentAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    /** Drafts (SPEC 15): absent means live. A draft is stored and counted but never in the public bundle. */
    state: v.optional(v.union(v.literal('draft'), v.literal('live'))),
    /** When a scheduled draft goes online (ms); only on a draft. */
    publishAt: v.optional(v.number()),
    /** The scheduled `entries.publishDue` run that belongs to `publishAt`. */
    publishJob: v.optional(v.id('_scheduled_functions')),
    /**
     * The staff member (user id) who created the entry through a create task: they may change it later with that
     * task (lib/access.ts `authorize`). Absent for entries of owners and admins, and for entries made before it existed.
     */
    createdBy: v.optional(v.string()),
  })
    .index('by_site_brick_order', ['site', 'brick', 'order'])
    .index('by_site_brick_deleted', ['site', 'brick', 'deletedAt'])
    .index('by_site_deleted', ['site', 'deletedAt']),

  /**
   * The trees of an entry's Markdown texts (core `markdownTrees`) as JSON text, split into parts below Convex's 1 MiB
   * document limit. Derived from `entries.data` and written with it (lib/trees.ts, the only code that touches this table),
   * so the bundle parses nothing. JSON text, because a tree may hold keys that a Convex value does not allow. An entry
   * without rows is parsed per request. After a parser change: `entries:migrateStorage`.
   */
  entryTrees: defineTable({ site: v.id('sites'), entry: v.id('entries'), part: v.number(), json: v.string() })
    .index('by_entry', ['entry', 'part'])
    .index('by_site', ['site']),

  /**
   * Unpublished changes of a live entry in a drafts collection (lib/pending.ts): Speichern keeps them here, Veröffentlichen
   * writes them into the entry through `commitEntry`, Verwerfen deletes the row. One row per entry. Never read by the
   * bundle, so the website shows only `entries.data`.
   */
  pendingChanges: defineTable({
    site: v.id('sites'),
    entry: v.id('entries'),
    brick: v.string(),
    /** Root field → its unpublished value; null: the field is removed. */
    fields: v.record(v.string(), v.any()),
    /** The prints of the leaves under those roots (they replace the entry's prints there). */
    prints: v.record(v.string(), v.record(v.string(), v.string())),
    /** Root field → the entry rev its unpublished value was saved at; a live write after it is a conflict at publish. */
    revs: v.record(v.string(), v.number()),
    /** Who saved last, when the first and the last save happened (ms). */
    by: v.string(),
    since: v.number(),
    at: v.number(),
    /** When the changes go online (ms), and the scheduled `entries.publishDue` run. */
    publishAt: v.optional(v.number()),
    publishJob: v.optional(v.id('_scheduled_functions')),
  }).index('by_entry', ['entry']).index('by_site', ['site']),

  slugs: defineTable({
    site: v.id('sites'),
    brick: v.string(),
    locale: v.string(),
    slug: v.string(),
    entry: v.id('entries'),
    /** An address the entry had before `entries.changeSlug`: still reserved, the site forwards it with a 301 (bundle `oldUrls`). */
    old: v.optional(v.boolean()),
  }).index('by_key', ['site', 'brick', 'locale', 'slug']).index('by_entry', ['entry']).index('by_site_old', ['site', 'old']),

  ops: defineTable({
    site: v.id('sites'),
    actor: v.string(),
    opId: v.string(),
    hash: v.string(),
    result: v.any(),
    at: v.number(),
  }).index('by_site_actor_op', ['site', 'actor', 'opId']).index('by_at', ['at']),

  changes: defineTable({
    site: v.id('sites'),
    entry: v.optional(v.id('entries')),
    brick: v.string(),
    actor: v.string(),
    /** Set when the person acted through the agent door (SPEC 16), with the key they used. */
    via: v.optional(v.literal('agent')),
    agentKey: v.optional(v.id('agentKeys')),
    /** The owner or admin who approved the proposal this change applies (SPEC 17); `actor` is the author. */
    approvedBy: v.optional(v.string()),
    opId: v.string(),
    kind: v.string(),
    /** German rendering of `msg`: the fallback for rows from before `msg` (they have no `msg`). Readers render `msg` in their own language. */
    sentence: v.string(),
    msg: v.optional(historyMsg),
    fields: v.optional(v.array(v.string())),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    printsBefore: v.optional(v.any()),
    printsAfter: v.optional(v.any()),
    entryRev: v.optional(v.number()),
    contentRev: v.number(),
    at: v.number(),
    undoneBy: v.optional(v.id('changes')),
  })
    .index('by_entry', ['entry']).index('by_site_at', ['site', 'at']).index('by_site_brick_at', ['site', 'brick', 'at']).index('by_at', ['at'])
    // "By me" / "By AI" filters (`changes.list`): `ai` is true for a change through the agent door; absent rows count as false.
    .index('by_site_actor_at', ['site', 'actor', 'at']).index('by_site_via_at', ['site', 'via', 'at']),

  /**
   * A key for the agent door (SPEC 16). It acts as its person with their role and grants at call
   * time; only the SHA-256 of the key is stored. `minute`/`calls` count calls for the rate limit.
   */
  agentKeys: defineTable({
    site: v.id('sites'),
    user: v.string(),
    hash: v.string(),
    label: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    minute: v.optional(v.number()),
    calls: v.optional(v.number()),
    /** Whether this key's writes are proposals (SPEC 17). Absent: the site's setting decides. */
    review: v.optional(v.boolean()),
  }).index('by_hash', ['hash']).index('by_site_user', ['site', 'user']).index('by_user', ['user']),

  /**
   * A change that needs a yes (SPEC 17). `args` are the arguments of the normal operation (with the
   * author's `opId`); approving runs that operation again as the author. `base` holds the revisions
   * the author saw, `before`/`after` the changed fields for the diff.
   */
  proposals: defineTable({
    site: v.id('sites'),
    op: v.union(v.literal('save'), v.literal('create'), v.literal('remove'), v.literal('publish'), v.literal('unpublish')),
    brick: v.string(),
    entry: v.optional(v.id('entries')),
    args: v.any(),
    base: v.any(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    /** German rendering of `msg`: the fallback for rows from before `msg` (they have no `msg`). Readers render `msg` in their own language. */
    sentence: v.string(),
    msg: v.optional(historyMsg),
    author: v.string(),
    via: v.union(v.literal('ui'), v.literal('agent')),
    agentKey: v.optional(v.id('agentKeys')),
    status: v.union(v.literal('open'), v.literal('approved'), v.literal('scheduled'), v.literal('applied'), v.literal('rejected'), v.literal('stale'), v.literal('withdrawn')),
    createdAt: v.number(),
    /** When a scheduled approval applies (ms), and its scheduled run. */
    at: v.optional(v.number()),
    job: v.optional(v.id('_scheduled_functions')),
    release: v.optional(v.id('releases')),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    /** The reason of a rejection, or why a proposal went stale (German). */
    reason: v.optional(v.string()),
    /** The catalog message of a stale reason (the `reason` text is its German rendering); absent on rejections (free text) and on rows from before. */
    reasonMsg: v.optional(historyMsg),
    /** The change row the applied proposal wrote, if it changed anything. */
    change: v.optional(v.id('changes')),
    /** Set once the digest mail has listed this proposal. */
    mailedAt: v.optional(v.number()),
  })
    .index('by_site', ['site']).index('by_site_status', ['site', 'status']).index('by_site_author', ['site', 'author'])
    // decidedAt last, so History reads "decided in the last two weeks" as a range; open rows have none and keep creation order.
    .index('by_site_status_decided', ['site', 'status', 'decidedAt']).index('by_site_author_status_decided', ['site', 'author', 'status', 'decidedAt'])
    .index('by_release', ['release']).index('by_decided', ['decidedAt']),

  /** A group of proposals approved together, all or none (SPEC 17). */
  releases: defineTable({
    site: v.id('sites'),
    name: v.string(),
    /** When it goes live: planned at creation, or set when it is approved. */
    at: v.optional(v.number()),
    job: v.optional(v.id('_scheduled_functions')),
    status: v.union(v.literal('open'), v.literal('scheduled'), v.literal('applied'), v.literal('stale')),
    createdBy: v.string(),
    createdAt: v.number(),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
  }).index('by_site_status', ['site', 'status']).index('by_decided', ['decidedAt']),

  migrationsApplied: defineTable({
    site: v.id('sites'),
    id: v.string(),
    brick: v.string(),
    fills: v.string(),
    fingerprint: v.string(),
    schemaRev: v.number(),
  }).index('by_site_id', ['site', 'id']),

  /** A one-time upload ticket (SPEC 4.3): who may store one file for which site, until when. Only its hash is kept. */
  uploadTickets: defineTable({
    tokenHash: v.string(),
    site: v.id('sites'),
    user: v.string(),
    expiresAt: v.number(),
    /** Library upload (SPEC 4.3): the file is kept and may go straight into a folder. */
    folder: v.optional(v.id('folders')),
    library: v.optional(v.boolean()),
  }).index('by_tokenHash', ['tokenHash']).index('by_expires', ['expiresAt']).index('by_site', ['site']),

  /** Folders of the asset library (SPEC 3). A file is in at most one; absent `parent` means the top level. */
  folders: defineTable({
    site: v.id('sites'),
    name: v.string(),
    parent: v.optional(v.id('folders')),
  }).index('by_site_parent', ['site', 'parent']),

  uploads: defineTable({
    site: v.id('sites'),
    uploader: v.string(),
    storageId: v.id('_storage'),
    processedId: v.optional(v.id('_storage')),
    /** Smaller WebP copies of an image for srcset (ascending width). Empty array: none needed; missing: not made yet (see images.backfillVariants). */
    variants: v.optional(v.array(v.object({ width: v.number(), storageId: v.id('_storage') }))),
    name: v.string(),
    size: v.number(),
    mime: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    status: v.union(v.literal('processing'), v.literal('ready'), v.literal('failed')),
    attempts: v.number(),
    /** Catalog key (`errors.upload…`) of the reason of the last failed processing attempt, shown to the uploader in their language. */
    error: v.optional(v.string()),
    folder: v.optional(v.id('folders')),
    /** Uploaded through the library, put in a folder or kept on purpose: the 7-day sweep leaves it alone. Missing means false. */
    kept: v.optional(v.boolean()),
    /** SHA-256 (hex) of the original bytes; equal values make the "Doppelt" view. */
    sha256: v.optional(v.string()),
    /** Focus point of an image, 0..1 from the top left. */
    focus: v.optional(v.object({ x: v.number(), y: v.number() })),
    /** Description (alt text) per language, written in the Files library: the default for every use of the photo without its own text. */
    alt: v.optional(v.record(v.string(), v.string())),
    /** In the trash since (ms). Purged after 30 days when nothing refers to it any more. */
    trashedAt: v.optional(v.number()),
    /** Files before a replace; their storage is deleted 30 days after `replacedAt`. */
    previous: v.optional(v.array(v.object({ storageId: v.id('_storage'), processedId: v.optional(v.id('_storage')), variants: v.optional(v.array(v.object({ width: v.number(), storageId: v.id('_storage') }))), replacedAt: v.number() }))),
    /** True while `previous` is not empty; lets the sweep and retention find these rows without a scan. */
    hasPrevious: v.optional(v.boolean()),
  })
    .index('by_site', ['site']).index('by_storage', ['storageId']).index('by_processed', ['processedId']).index('by_status', ['status'])
    .index('by_site_folder', ['site', 'folder']).index('by_site_sha256', ['site', 'sha256']).index('by_site_trashed', ['site', 'trashedAt'])
    .index('by_previous', ['hasPrevious']),

  fileRefs: defineTable({
    site: v.id('sites'),
    file: v.id('uploads'),
    holder: v.union(v.literal('entry'), v.literal('change'), v.literal('pending')),
    holderId: v.string(),
    /** Entry holders only: where in the entry the file sits, and whether that image lacks a description in a language of the site. */
    uses: v.optional(v.array(v.object({ path: v.string(), missingAlt: v.boolean() }))),
    missingAlt: v.optional(v.boolean()),
  })
    .index('by_file', ['file']).index('by_holder', ['holder', 'holderId'])
    .index('by_site_holder', ['site', 'holder']).index('by_site_missingAlt', ['site', 'missingAlt']),

  pushKeys: defineTable({
    site: v.id('sites'),
    hash: v.string(),
    label: v.string(),
    scopes: v.array(scope),
    createdBy: v.string(),
    revokedAt: v.optional(v.number()),
    /** When a CLI route last accepted the key, stamped at most once an hour (routes/key.ts). */
    lastUsedAt: v.optional(v.number()),
  }).index('by_hash', ['hash']).index('by_site', ['site']),

  /** A saved list view of one person (SPEC 4.2 views): a filter and sort of a brick's entry list. Never shared. */
  views: defineTable({
    site: v.id('sites'),
    user: v.string(),
    brick: v.string(),
    name: v.string(),
    /** `{ text?, filters?, sort? }`; the shape is checked by `views.save`. */
    query: v.any(),
  }).index('by_site_user_brick', ['site', 'user', 'brick']).index('by_user', ['user']),

  /**
   * Fixed-window counters per site; `window` = minute since epoch. No `kind`: bundle requests (600 per minute).
   * `invite`: invite mails (invites.create), one row per hour, its window the hour's first minute.
   * `upload`: upload tickets (uploads.prepare), one row per person (`user`) and hour.
   */
  rateWindows: defineTable({ site: v.id('sites'), kind: v.optional(v.union(v.literal('invite'), v.literal('upload'))), user: v.optional(v.string()), window: v.number(), count: v.number() })
    .index('by_site_kind_window', ['site', 'kind', 'window', 'user']).index('by_window', ['window']),

  /** A person's own settings, one row each. No row means the defaults: reminders on, German (SPEC 10). `locale` is the language of messages and mail to this person. */
  /**
   * `locale`: the Studio language the person chose; it wins over the browser. `seenLocale`: the browser's language at the
   * last visit without a choice, only for mails (sign-in code, reminders), so they come in a language the person reads.
   * `name`: how the person's teams see them in history, conflicts, files and keys (`lib/names.ts`); without it, their email.
   */
  userSettings: defineTable({ user: v.string(), remindByMail: v.boolean(), locale: v.optional(v.string()), seenLocale: v.optional(v.string()), name: v.optional(v.string()) }).index('by_user', ['user']),

  /** One sent reminder mail (SPEC 10): the work week it was for, so a sweep that runs again sends nothing twice. */
  reminders: defineTable({ site: v.id('sites'), brick: v.string(), week: v.string(), user: v.string(), at: v.number() })
    .index('by_site_brick_week_user', ['site', 'brick', 'week', 'user']),

  /** Local and test mail sink (GINKO_MAIL=outbox). */
  outbox: defineTable({ to: v.string(), subject: v.string(), text: v.string(), at: v.number() }).index('by_to', ['to']).index('by_at', ['at']),
})
