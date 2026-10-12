// The tool catalog of the agent door (SPEC 16), kept apart from the calls in agent.ts: which tools exist
// for a person, how the model is told about them, and the pure helpers some of them use (search text).
// A tool is listed only when the person may use it; agent.ts checks the same list again at call time.
import { labelOf, type Brick, type CollectionBrick, type Json, type Schema, type Task } from '@lupinum/ginko'
import type { Actor } from './access'

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

/** A granted task of the brick and kind for staff (admins and owners need none), e.g. to undo through the door. */
export function taskFor(actor: Actor, brick: string, kind: Task['kind'], fields: readonly string[] = []): string | undefined {
  const covers = (task: Task) => task.kind === kind && (task.kind !== 'edit' || fields.every((f) => task.fields.includes(f)))
  return taskTools(actor).find((t) => t.brick === brick && covers(t.task))?.ref
}

/** Whether the person changes existing entries at all: owners and admins always, staff with an `edit` task. */
export const mayEdit = (actor: Actor): boolean => actor.role !== 'staff' || taskTools(actor).some((t) => t.task.kind === 'edit')

/** The collections whose entries start as drafts and where this person may create entries. */
export function draftBricks(actor: Actor): string[] {
  const schema = actor.site.schema as Schema
  return Object.entries(schema.bricks)
    .filter(([key, def]) => def.kind === 'collection' && (def as CollectionBrick).drafts === true && !def.retired && (actor.role !== 'staff' || taskFor(actor, key, 'create') !== undefined))
    .map(([key]) => key)
}

/** `propose` on every write tool: "show me first". */
export const PROPOSE = { type: 'boolean', description: 'true: do not change anything now; show the change to the person as a proposal they approve.' } as const

export interface ToolDef { name: string; description: string; inputSchema: Json }

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
    },
    {
      name: 'ginko_read',
      description: 'Reads the published content of a brick as the website shows it. Collections include the entry IDs. Drafts are not in it. '
        + 'For another language, "fallback" lists the texts that are missing or outdated, and "stale" the outdated translations among them.',
      inputSchema: object({ brick: { type: 'string', description: 'Key of the brick (from ginko_overview)' }, locale: { type: 'string', description: `Language; default is the main language (${main})` } }, ['brick']),
    },
    {
      name: 'ginko_search',
      description: 'Searches the texts of all entries (drafts too) for words. Case does not matter; write umlauts as "ae", "oe", "ue". Returns ID, brick, label and a snippet.',
      inputSchema: object({
        query: { type: 'string', description: 'Search words', minLength: 1, maxLength: 200 },
        brick: { type: 'string', description: 'Search only in this brick' },
        limit: { type: 'integer', minimum: 1, maximum: SEARCH_MAX, description: `At most this many hits, default 10` },
      }, ['query']),
    },
    {
      name: 'ginko_history',
      description: 'The latest changes to the website, newest first, with the ID that ginko_undo, ginko_version_at and ginko_revert take.',
      inputSchema: object({ limit: { type: 'integer', minimum: 1, maximum: HISTORY_MAX } }),
    },
    {
      name: 'ginko_undo',
      description: 'Takes back one change, like the undo button in the platform. The ID comes from the answer of a task or from ginko_history.',
      inputSchema: object({ change }, ['change']),
    },
    {
      name: 'ginko_version_at',
      description: 'Shows how an entry looked right after an earlier change (fields in storage format). Changes nothing. "fields" names the fields that changed since.',
      inputSchema: object({ entry, change }, ['entry', 'change']),
    },
  ]
  if (mayEdit(actor)) {
    tools.push({
      name: 'ginko_revert',
      description: 'Sets an entry back to its state after an earlier change (only the fields that changed since). This is a new change and ginko_undo can take it back. Look at ginko_version_at first.',
      inputSchema: object({ entry, change, propose: PROPOSE }, ['entry', 'change']),
    })
    if (foreign.length) {
      tools.push({
        name: 'ginko_translate',
        description: `Writes translations of an entry into a foreign language (${foreign.join(', ')}); you change the main language ${main} with the tasks. `
          + 'Only translatable text fields, each with the text in the target language. "confirm" names fields whose existing translation may stay although the main text changed.',
        inputSchema: object({
          entry,
          locale: { type: 'string', enum: foreign, description: 'Target language' },
          fields: { type: 'object', description: 'Field name → translated text, e.g. { "name": "Pumpkin soup" }' },
          confirm: { type: 'array', items: { type: 'string' }, description: 'Field names whose translation stays valid as it is' },
          propose: PROPOSE,
        }, ['entry', 'locale']),
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
      inputSchema: object({ brick: { type: 'string', enum: drafts }, fields: { type: 'object', description: 'Field name → value' } }, ['brick', 'fields']),
    })
  }
  tools.push(
    {
      name: 'ginko_file_usage',
      description: 'Shows where a file (image or PDF) is used: entry, brick, label, paths, and whether an image lacks its description.',
      inputSchema: object({ file: { type: 'string', description: 'ID of the file' } }, ['file']),
    },
    {
      name: 'ginko_check_links',
      description: "Checks the links in the texts of the website: broken internal links and unsafe links. Returns entry, field, link and reason. Ginko does not know the files in the website's public folder; links to them are reported as unknown.",
      inputSchema: object({ brick: { type: 'string', description: 'Report only this brick' } }),
    },
    {
      name: 'ginko_proposals',
      description: 'Your own proposals with their state and reason (open, scheduled, applied, rejected, stale, withdrawn). Use it to tell the person what still waits for approval.',
      inputSchema: object({ status: { type: 'string', enum: ['open', 'scheduled', 'applied', 'rejected', 'stale', 'withdrawn'] } }),
    },
  )
  return tools
}

/** Tools that only read: the HTTP layer sends them to a query. */
export const READ_TOOLS = new Set(['ginko_search', 'ginko_version_at', 'ginko_file_usage', 'ginko_check_links', 'ginko_proposals'])

// ---- Links ----

const MARKDOWN_LINK = /\]\(\s*<?([^)\s>]+)/g

/** The targets of the inline links in a Markdown text. */
export function linksIn(markdown: string): string[] {
  return [...markdown.matchAll(MARKDOWN_LINK)].map((m) => m[1]!)
}
