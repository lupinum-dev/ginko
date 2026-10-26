// The tool catalog of the agent door (SPEC 16), kept apart from the calls in agent.ts: which tools exist
// for a person, how the model is told about them, and the pure helpers some of them use (search text).
// A tool is listed only when the person may use it; agent.ts checks the same list again at call time.
import type { Brick, CollectionBrick, Json, Task } from '@lupinum/ginko'
import { labelOf, type Schema } from '@lupinum/ginko/internal'
import type { Doc } from '../_generated/dataModel'
import { createdBy, type Actor } from './access'

export const HISTORY_MAX = 50
export const SEARCH_MAX = 20

export interface TaskTool { name: string; brick: string; task: Task; ref: string }

/** The tasks a person may run, as tool names. Admins and owners get every task; staff their grants (SPEC 2.7). */
export function taskTools(actor: Actor): TaskTool[] {
  const schema = actor.site.schema as Schema
  const out: TaskTool[] = []
  for (const [brick, def] of Object.entries(schema.bricks)) {
    if (def.retired) continue
    for (const task of def.tasks ?? []) {
      const ref = `${brick}.${task.id}`
      if (actor.role === 'staff' && !actor.grants.includes(ref)) continue
      out.push({ name: `task_${brick}_${task.id}`, brick, task, ref })
    }
  }
  return out
}

/** The tool description of a task: the labels are the site's own words (main language), the rest is for the model. */
export function describeTask(brick: Brick, task: Task, main: string): string {
  const what = task.kind === 'create' ? 'Creates a new entry.'
    : task.kind === 'remove' ? 'Removes an entry; its ID is in ginko_read.'
    : 'pick' in task && task.pick ? 'Changes an entry; its ID is in ginko_read. Fields you leave out stay as they are.'
    : 'Changes the brick. Fields you leave out stay as they are.'
  return `${labelOf(task.label, main, main)} (${labelOf(brick.label, main, main)}). ${what}`
}

/**
 * A granted task of the brick and kind for staff (admins and owners need none), e.g. to undo through the door. For a
 * change of an entry the person created (`entry`), their create task of the brick serves when no edit task covers it
 * (lib/access.ts `authorize`).
 */
export function taskFor(actor: Actor, brick: string, kind: Task['kind'], fields: readonly string[] = [], entry?: Pick<Doc<'entries'>, 'createdBy'> | null): string | undefined {
  const covers = (task: Task) => task.kind === kind && (task.kind !== 'edit' || fields.every((f) => task.fields.includes(f)))
  const tools = taskTools(actor).filter((t) => t.brick === brick)
  const found = tools.find((t) => covers(t.task))?.ref
  if (found || kind !== 'edit' || !createdBy(actor, entry)) return found
  return tools.find((t) => t.task.kind === 'create')?.ref
}

/** Whether the person changes existing entries at all: owners and admins always, staff with an `edit` task, or a `create` task for the entries they made. */
export const mayEdit = (actor: Actor): boolean => actor.role !== 'staff' || taskTools(actor).some((t) => t.task.kind === 'edit' || t.task.kind === 'create')

/** The collections whose entries start as drafts and where this person may create entries. */
export function draftBricks(actor: Actor): string[] {
  const schema = actor.site.schema as Schema
  return Object.entries(schema.bricks)
    .filter(([key, def]) => def.kind === 'collection' && (def as CollectionBrick).drafts === true && !def.retired && (actor.role !== 'staff' || taskFor(actor, key, 'create') !== undefined))
    .map(([key]) => key)
}

/** `propose` on every write tool: "show me first". */
export const PROPOSE = { type: 'boolean', description: 'true: do not change anything now; show the change to the person as a proposal they approve.' } as const

/** `request_id` on every write tool: a retry key of the assistant's choice (agent.call). With `mcp-` in front it is an op id, so at most 60 characters. */
export const REQUEST_ID = {
  type: 'string', pattern: '^[A-Za-z0-9_-]{1,60}$',
  description: 'Optional. Send the same value when you retry this call, so it runs only once. Letters, digits, _ and -, at most 60.',
} as const

/**
 * MCP tool hints (annotations) for the host, which may ask the person before a destructive call. In MCP,
 * destructiveHint false means "only additive updates": that holds for a new entry or draft only. Any other write may
 * overwrite a value or, as an undo of a create, remove an entry, as in the library's own door.
 */
export interface ToolHints { readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint: boolean }
const READS: ToolHints = { readOnlyHint: true, openWorldHint: false }
const ADDS: ToolHints = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const WRITES: ToolHints = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
/** The hints of a task tool: only a create task is additive. */
export const taskHints = (task: Task): ToolHints => (task.kind === 'create' ? ADDS : WRITES)

export interface ToolDef { name: string; description: string; inputSchema: Json; annotations: ToolHints }

const object = (properties: Record<string, Json>, required: string[] = []): Json => ({ type: 'object', properties, required, additionalProperties: false })

/** What the person's key may use besides the task tools. */
export function fixedTools(actor: Actor): ToolDef[] {
  const schema = actor.site.schema as Schema
  const main = schema.locales[0]!
  const foreign = schema.locales.slice(1)
  const entry = { type: 'string', description: 'ID of the entry (from ginko_read or ginko_search)' }
  const change = { type: 'string', description: 'ID of the change (from ginko_history)' }
  const tools: ToolDef[] = [
    {
      name: 'ginko_overview',
      description: 'Overview: the website, its languages, its bricks (content areas) and the tasks you may run. Also says whether your changes wait for approval before they go live.',
      inputSchema: object({}),
      annotations: READS,
    },
    {
      name: 'ginko_read',
      description: 'Reads the published content of a brick as the website shows it. Collections include the entry IDs. Drafts are not in it. '
        + 'For another language, "fallback" lists the texts shown in the main language because their translation is missing; "stale" lists outdated translations, which the website still shows until they are translated again or confirmed. '
        + 'By default, an entry with its own page is left out of a language until its required texts are translated there; read the main language to find it.',
      inputSchema: object({ brick: { type: 'string', description: 'Key of the brick (from ginko_overview)' }, locale: { type: 'string', description: `Language; default is the main language (${main})` } }, ['brick']),
      annotations: READS,
    },
    {
      name: 'ginko_search',
      description: 'Searches the texts of all entries (drafts too) for words. Case does not matter; write umlauts as "ae", "oe", "ue". Returns ID, brick, label and a snippet.',
      inputSchema: object({
        query: { type: 'string', description: 'Search words', minLength: 1, maxLength: 200 },
        brick: { type: 'string', description: 'Search only in this brick' },
        limit: { type: 'integer', minimum: 1, maximum: SEARCH_MAX, description: `At most this many hits, default 10` },
      }, ['query']),
      annotations: READS,
    },
    {
      name: 'ginko_history',
      description: 'The latest changes to the website, newest first, with the ID that ginko_undo, ginko_version_at and ginko_revert take.',
      inputSchema: object({ limit: { type: 'integer', minimum: 1, maximum: HISTORY_MAX } }),
      annotations: READS,
    },
    {
      name: 'ginko_undo',
      description: 'Takes back one change, like the undo button in the platform. The ID comes from the answer of a task or from ginko_history.',
      inputSchema: object({ change, request_id: REQUEST_ID }, ['change']),
      annotations: WRITES,
    },
    {
      name: 'ginko_version_at',
      description: 'Shows how an entry looked right after an earlier change (fields in storage format). Changes nothing. "fields" names the fields that changed since; "diff" lists what ginko_revert would change, with now as "before" and that version as "after" (empty: it is the current state).',
      inputSchema: object({ entry, change }, ['entry', 'change']),
      annotations: READS,
    },
  ]
  if (mayEdit(actor)) {
    tools.push({
      name: 'ginko_revert',
      description: 'Sets an entry back to its state after an earlier change (only the fields that changed since). This is a new change and ginko_undo can take it back. Look at ginko_version_at first.',
      inputSchema: object({ entry, change, propose: PROPOSE, request_id: REQUEST_ID }, ['entry', 'change']),
      annotations: WRITES,
    })
    if (foreign.length) {
      tools.push({
        name: 'ginko_translate',
        // Not every entry has a task that changes its main language (events have add and remove only; the creator rule
        // reaches only translate, revert and undo here), so the text promises no such path.
        description: `Writes translations of an entry into a foreign language (${foreign.join(', ')}). The main language ${main} changes only through a task that changes entries; where there is none, the person changes it in the platform. `
          + 'Only translatable text fields, each with the text in the target language. "confirm" names fields whose existing translation may stay although the main text changed.',
        inputSchema: object({
          entry,
          locale: { type: 'string', enum: foreign, description: 'Target language' },
          fields: { type: 'object', description: 'Field name → translated text, e.g. { "name": "Pumpkin soup" }' },
          confirm: { type: 'array', items: { type: 'string' }, description: 'Field names whose translation stays valid as it is' },
          propose: PROPOSE,
          request_id: REQUEST_ID,
        }, ['entry', 'locale']),
        annotations: WRITES,
      })
    }
  }
  const drafts = draftBricks(actor)
  if (drafts.length) {
    const lines = drafts.map((key) => {
      const def = schema.bricks[key]!
      const keys = Object.entries(def.fields).filter(([, f]) => f.type !== 'slug' && !f.retired).map(([k, f]) => `${k} (${labelOf(f.label, main, main)}${f.optional || f.default !== undefined ? '' : ', required'})`)
      return `${key} (${labelOf(def.label, main, main)}): ${keys.join(', ')}`
    })
    tools.push({
      name: 'ginko_draft',
      description: 'Creates a new entry as a draft. A draft is not on the website; the person publishes it in the platform. '
        + `Values as in the tasks: texts in ${main} as plain text, money in whole currency units (19.90), lists as a list of objects. Fields per brick: ${lines.join('; ')}.`,
      inputSchema: object({ brick: { type: 'string', enum: drafts }, fields: { type: 'object', description: 'Field name → value' }, request_id: REQUEST_ID }, ['brick', 'fields']),
      annotations: ADDS,
    })
  }
  tools.push(
    {
      name: 'ginko_file_usage',
      description: 'Shows where a file (image or PDF) is used: entry, brick, label, paths, and whether an image lacks its description. '
        + 'A Markdown text names a file by its ID as $file.<ID>, e.g. ![Short description]($file.<ID>) for an image; never write a storage address.',
      inputSchema: object({ file: { type: 'string', description: 'ID of the file' } }, ['file']),
      annotations: READS,
    },
    {
      name: 'ginko_check_links',
      description: "Checks the links in the texts of the website: broken internal links and unsafe links. Returns entry, field, link and reason. Ginko does not know the files in the website's public folder; links to them are reported as unknown.",
      inputSchema: object({ brick: { type: 'string', description: 'Report only this brick' } }),
      annotations: READS,
    },
    {
      name: 'ginko_proposals',
      description: 'Your own proposals with their state and reason (open, scheduled, applied, rejected, stale, withdrawn). Use it to tell the person what still waits for approval.',
      inputSchema: object({ status: { type: 'string', enum: ['open', 'scheduled', 'applied', 'rejected', 'stale', 'withdrawn'] } }),
      annotations: READS,
    },
  )
  return tools
}

// ---- Builder tools: owners and admins set up and fill a site, as they can in the Studio. ----

/** Thrown at the end of an import's dry run, so Convex rolls back every write; routes/mcp.ts turns it into the answer. */
export const DRY_RUN = 'DRY_RUN'

/** Items per ginko_import: one mutation writes them all or none. */
export const IMPORT_MAX = 50

/** Owners and admins write any field of any brick in the Studio; staff only run their tasks. */
export const isBuilder = (actor: Actor): boolean => actor.role !== 'staff'

export const BUILDER_TOOLS = new Set(['ginko_schema', 'ginko_write', 'ginko_create', 'ginko_import', 'ginko_upload'])

/** The tools for building and filling the site, for owners and admins only. */
export function builderTools(actor: Actor): ToolDef[] {
  if (!isBuilder(actor)) return []
  const schema = actor.site.schema as Schema
  const main = schema.locales[0]!
  const brick = { type: 'string', description: 'Key of the brick (from ginko_overview)' }
  const entry = { type: 'string', description: 'ID of the entry (from ginko_read or ginko_search). Leave it out for a single brick.' }
  const fields = { type: 'object', description: 'Field name → value in the form ginko_schema describes' }
  const values = `Values as ginko_schema describes them: texts in ${main} as plain text or Markdown, money in whole currency units (19.90), `
    + 'dates as YYYY-MM-DD, references and files by ID, lists as a list of objects (a list replaces the whole list).'
  return [
    {
      name: 'ginko_schema',
      description: 'The fields of every brick (or one) as JSON Schema, in the form ginko_write, ginko_create and ginko_import take them, '
        + 'with kind, label, route and whether new entries start as drafts. Read it before you write.',
      inputSchema: object({ brick: { type: 'string', description: 'Only this brick' } }),
      annotations: READS,
    },
    {
      name: 'ginko_write',
      description: `Changes fields of an entry, or of a single brick, in the main language (${main}). Fields you leave out stay as they are; null removes an optional value. `
        + `${values} Foreign languages go through ginko_translate. In a collection with drafts, a change to a published entry waits as an unpublished change; the person publishes it in the platform.`,
      inputSchema: object({ brick, entry, fields, propose: PROPOSE, request_id: REQUEST_ID }, ['brick', 'fields']),
      annotations: WRITES,
    },
    {
      name: 'ginko_create',
      description: `Creates an entry in a collection. ${values} The address (slug) comes from the title. `
        + 'In a collection with drafts the entry is a draft unless publish is true.',
      inputSchema: object({
        brick, fields,
        publish: { type: 'boolean', description: 'Only for a collection with drafts: true puts the entry on the website at once.' },
        propose: PROPOSE, request_id: REQUEST_ID,
      }, ['brick', 'fields']),
      annotations: ADDS,
    },
    {
      name: 'ginko_import',
      description: `Writes up to ${IMPORT_MAX} items in one step, all or nothing: an item with entry (or for a single brick) changes it like ginko_write, `
        + 'one without creates an entry like ginko_create. An error names the item and nothing is saved. dry_run: true checks every item with the real save and saves nothing.',
      inputSchema: object({
        items: {
          type: 'array', minItems: 1, maxItems: IMPORT_MAX,
          items: object({ brick, entry, fields, publish: { type: 'boolean' } }, ['brick', 'fields']),
        },
        dry_run: { type: 'boolean', description: 'true: check only, save nothing.' },
        request_id: REQUEST_ID,
      }, ['items']),
      annotations: WRITES,
    },
    {
      name: 'ginko_upload',
      description: 'Adds an image (JPEG, PNG, WebP) or a PDF to the files of the website. With url, Ginko fetches a public https address. '
        + 'Without url, the answer is a one-time upload address (10 minutes) and a curl command for a file on your computer. '
        + 'Use the file ID in an image field ({ "file": ID, "alt": "…" }) or in Markdown as ![Description]($file.<ID>). Images are processed for a few seconds.',
      inputSchema: object({
        url: { type: 'string', description: 'Public https address of the file' },
        name: { type: 'string', description: 'File name with extension, e.g. team.jpg' },
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
  ]
}

/**
 * The keys a mistyped name probably means, best first, at most three: same letters ignoring case and separators, a key
 * or label that contains the word (one that starts with it first), or a small edit distance. Empty when nothing is close.
 */
export function suggest(word: string, candidates: readonly { key: string; label: string }[]): string[] {
  const norm = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const w = norm(word)
  if (!w) return []
  const exact = candidates.find((c) => norm(c.key) === w || norm(c.label) === w)
  if (exact) return [exact.key]
  const starts = (c: { key: string; label: string }) => norm(c.key).startsWith(w) || norm(c.label).startsWith(w)
  const part = candidates.filter((c) => w.length >= 3 && (norm(c.key).includes(w) || w.includes(norm(c.key)) || norm(c.label).includes(w)))
  if (part.length) return [...part.filter(starts), ...part.filter((c) => !starts(c))].slice(0, 3).map((c) => c.key)
  let best: { key: string; d: number } | undefined
  for (const c of candidates) {
    const d = distance(w, norm(c.key))
    if (d <= Math.max(1, Math.floor(w.length / 3)) && (!best || d < best.d)) best = { key: c.key, d }
  }
  return best ? [best.key] : []
}

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  return row[b.length]!
}

/** Tools that only read: the HTTP layer sends them to a query. */
export const READ_TOOLS = new Set(['ginko_search', 'ginko_version_at', 'ginko_file_usage', 'ginko_check_links', 'ginko_proposals', 'ginko_schema'])

// ---- Links ----

const MARKDOWN_LINK = /\]\(\s*<?([^)\s>]+)/g

/** The targets of the inline links in a Markdown text. */
export function linksIn(markdown: string): string[] {
  return [...markdown.matchAll(MARKDOWN_LINK)].map((m) => m[1]!)
}
