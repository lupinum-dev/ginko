// POST /mcp: the agent door (SPEC 16) as MCP Streamable HTTP, stateless: one JSON-RPC request in, one
// JSON answer out, no SSE, no session. Order: key and rate limit, then the method. Tool failures are
// tool results with `isError` and the English message, so the assistant can tell the person.
import type { Json } from '@lupinum/ginko'
import { coreMessage, sha256, SITE_BUDGET } from '@lupinum/ginko/internal'
import type { HttpRouter } from 'convex/server'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { httpAction, type ActionCtx } from '../_generated/server'
import { DRY_RUN, READ_TOOLS } from '../lib/agentTools'
import { badKey } from '../lib/input'
import { t, type MessageKey } from '../lib/i18n'
import { isFetchableSiteUrl } from '../lib/siteUrl'
import { kindOf, TOO_LARGE, WRONG_TYPE } from '../lib/files'
import { storeFile } from './upload'

const PROTOCOL = '2025-06-18'
/** An answer holds at least one whole entry the Studio can save (SITE_BUDGET.entryBytes) plus room for its wrapping. */
const ANSWER_MAX = SITE_BUDGET.entryBytes + 64 * 1024
const BODY_MAX = 512 * 1024
const KEY = /^ginko_agent_[a-z0-9]{32}$/

// Written for the model, in English whatever the language of the site: the model answers the person in theirs.
const INSTRUCTIONS = 'Ginko maintains the content of one website for one person. Call ginko_overview first. Every task is a tool. '
  + 'Changes are live in about a minute and can be taken back with ginko_undo. Ask the person before removing anything. '
  + 'When you retry a change, send the same request_id, so it runs only once. '
  + 'Texts that belong to the website stay in the language of the website; answer the person in their own language. '
  + 'Owners and admins also build and fill the site: ginko_schema shows every field, ginko_write, ginko_create and ginko_import write them (ginko_import with dry_run first), ginko_upload adds files.'

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, Json> }

function reply(status: number, body?: unknown, extra: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), 'cache-control': 'no-store', ...extra },
  })
}
const result = (id: Rpc['id'], value: unknown) => reply(200, { jsonrpc: '2.0', id, result: value })
const rpcError = (id: Rpc['id'], code: number, message: string, status = 200) => reply(status, { jsonrpc: '2.0', id: id ?? null, error: { code, message } })

function isRpc(body: unknown): body is Rpc {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  const b = body as Record<string, unknown>
  const idOk = b.id === undefined || b.id === null || typeof b.id === 'string' || typeof b.id === 'number'
  const paramsOk = b.params === undefined || (typeof b.params === 'object' && b.params !== null && !Array.isArray(b.params))
  return b.jsonrpc === '2.0' && typeof b.method === 'string' && idOk && paramsOk
}

/** A tool answer: the sentence for the person first, the data as JSON after it. */
function toolText(text: string, data?: unknown, isError = false) {
  const content = [{ type: 'text', text }]
  if (data !== undefined) content.push({ type: 'text', text: JSON.stringify(data) })
  return { content, isError }
}

/** The English message of a thrown `fail(...)` (its catalog key, else the stored German text); anything else is a generic failure. */
function messageOf(error: unknown): string {
  const data = (error as { data?: unknown }).data
  if (data && typeof data === 'object' && 'message' in data) {
    const { message, key, params, details, at } = data as { message: string; key?: string; params?: Record<string, string | number>; at?: string; details?: { errors?: { message: string; key?: string; params?: Record<string, string | number>; path?: string }[] } }
    const head = key ? t('en', key as MessageKey, params) : message
    // A field error names its path ("price: …"), so the assistant knows which value to fix.
    const issues = details?.errors?.map((e) => `${e.path ? `${e.path}: ` : ''}${e.key ? coreMessage('en', e.key, e.params) : e.message}`) ?? []
    const text = issues.length ? `${head} ${issues.join(' ')}` : head
    // An import names the item that failed; nothing of the import is saved.
    return at ? `${at}: ${text} Nothing of this import was saved.` : text
  }
  return 'That did not work. Try again later.'
}

async function callTool(ctx: ActionCtx, key: Id<'agentKeys'>, name: string, args: Record<string, Json>) {
  // Convex refuses such a key with an uncoded error before agent.call runs; the assistant needs the name to fix the call.
  const bad = badKey(args)
  if (bad) return toolText(t('en', 'errors.nameNotAllowed', { name: bad }), undefined, true)
  try {
    if (name === 'ginko_overview') return toolText('Overview of the website.', await ctx.runQuery(internal.agent.overview, { key }))
    if (name === 'ginko_history') {
      const limit = typeof args.limit === 'number' ? args.limit : undefined
      return toolText('The latest changes, newest first.', await ctx.runQuery(internal.agent.history, { key, limit }))
    }
    if (name === 'ginko_read') {
      // Any member may read the whole site (SPEC 2.7); the content is the public bundle, so drafts are not in it.
      const { site } = await ctx.runQuery(internal.agent.overview, { key })
      const bundle = await ctx.runQuery(internal.bundle.build, { slug: site, locale: typeof args.locale === 'string' ? args.locale : '' })
      if (typeof bundle === 'string') return toolText('The website cannot be read right now.', undefined, true)
      const brick = typeof args.brick === 'string' && Object.hasOwn(bundle.bricks, args.brick) ? bundle.bricks[args.brick] : undefined
      if (!brick) return toolText(`There is no brick “${String(args.brick)}”. The brick keys are in ginko_overview.`, undefined, true)
      // In another language, `fallback` names the missing translations and `stale` the outdated ones, which the website still shows.
      if (bundle.locale !== bundle.mainLocale) {
        const stale = await ctx.runQuery(internal.agent.stale, { key, brick: String(args.brick), locale: bundle.locale })
        if (Object.keys(stale).length) return toolText(`Content of “${String(args.brick)}” (${bundle.locale}).`, { ...brick, stale })
      }
      return toolText(`Content of “${String(args.brick)}” (${bundle.locale}).`, brick)
    }
    if (name === 'ginko_upload') return await uploadThroughDoor(ctx, key, args)
    if (READ_TOOLS.has(name)) {
      const done = await ctx.runQuery(internal.agent.lookup, { key, name, args })
      return toolText(done.text, done.result)
    }
    const done = await ctx.runMutation(internal.agent.call, { key, name, args })
    return toolText(done.text, done.result)
  } catch (error) {
    // A dry run of ginko_import ends with a throw, so nothing it wrote is kept.
    const data = (error as { data?: { code?: string; results?: unknown[] } }).data
    if (data?.code === DRY_RUN) return toolText(dryRunText((data.results ?? []) as { proposed?: boolean }[]), data.results)
    return toolText(messageOf(error), undefined, true)
  }
}

/** What a dry run of ginko_import says: each item passed the real save; with review on, some would be proposals. */
export function dryRunText(results: readonly { proposed?: boolean }[]): string {
  const proposed = results.filter((r) => r.proposed).length
  const would = proposed === results.length ? 'would become proposals that wait for approval' : proposed ? `would be saved (${proposed} of them as proposals that wait for approval)` : 'would be saved'
  return `Dry run: all ${results.length} items ${would}. Nothing was saved.`
}

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }
/** The Content-Type for a file name's extension, if it is one the library takes. */
const typeOfName = (name: string): string | undefined => TYPES[name.split('.').pop()?.toLowerCase() ?? '']

/** The last part of a path ("photos/team.jpg" → "team.jpg"), for the stored file name. */
const baseName = (path: string) => path.split(/[\\/]/).pop()!.trim()

/** `text` as one shell word in single quotes, so a file name cannot end the quote. */
const shellWord = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`

const REDIRECTS = 3
/** How long the door waits for a file, from the first request to the last byte. */
const FETCH_MS = 20_000

/** The file at a public address, following at most REDIRECTS redirects, each to a public address too. */
async function fetchPublic(address: string, signal: AbortSignal): Promise<{ response: Response; url: URL } | { refused: string }> {
  const local = process.env.GINKO_LOCAL === '1'
  let url = address
  for (let hop = 0; hop <= REDIRECTS; hop++) {
    if (!isFetchableSiteUrl(url, local)) return { refused: t('en', 'errors.uploadUrlNotAllowed') }
    let response: Response
    try {
      response = await fetch(url, { redirect: 'manual', signal })
    } catch {
      return { refused: t('en', 'errors.uploadFetchFailed', { url: address, status: signal.aborted ? 'no answer within 20 seconds' : 'network error' }) }
    }
    const next = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
    if (!next) return { response, url: new URL(url) }
    await response.body?.cancel()
    try {
      url = new URL(next, url).toString()
    } catch {
      return { refused: t('en', 'errors.uploadFetchFailed', { url: address, status: 'invalid redirect' }) }
    }
  }
  return { refused: t('en', 'errors.uploadFetchFailed', { url: address, status: 'too many redirects' }) }
}

/**
 * The body, or undefined once it passes `limit` bytes (a missing or wrong Content-Length does not get around it). With
 * a Content-Length the buffer is that size from the start; without, it doubles as needed. One copy of the file at most.
 */
async function readCapped(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > limit) {
    await response.body?.cancel()
    return undefined
  }
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array(0)
  let out = new Uint8Array(declared || 64 * 1024)
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (size + value.byteLength > limit) {
      await reader.cancel()
      return undefined
    }
    if (size + value.byteLength > out.byteLength) {
      const grown = new Uint8Array(Math.min(limit, Math.max(out.byteLength * 2, size + value.byteLength)))
      grown.set(out.subarray(0, size))
      out = grown
    }
    out.set(value, size)
    size += value.byteLength
  }
  return size === out.byteLength ? out : out.slice(0, size)
}

/** The file name at the end of an address ("team.jpg"), or '' when there is none or it is not valid percent-encoding. */
function lastSegment(url: URL): string {
  try {
    return decodeURIComponent(url.pathname.split('/').pop() ?? '')
  } catch {
    return ''
  }
}

/**
 * ginko_upload: a library file for the key's person, through the same ticket and checks as the Studio's upload. With
 * `url` the door fetches the file and takes the ticket only once the file passed (so a failed fetch costs no upload
 * of the person's quota); without, it hands out the one-time upload address for a local file.
 */
async function uploadThroughDoor(ctx: ActionCtx, key: Id<'agentKeys'>, args: Record<string, Json>) {
  const url = typeof args.url === 'string' ? args.url : undefined
  const given = typeof args.name === 'string' ? args.name.trim() : ''
  if (url === undefined) {
    const { ticket } = await ctx.runMutation(internal.agent.uploadTicket, { key })
    const path = given || 'file.jpg'
    const name = baseName(path) || 'file.jpg'
    const address = `${process.env.CONVEX_SITE_URL}/upload?ticket=${encodeURIComponent(ticket)}&name=${encodeURIComponent(name)}`
    const type = typeOfName(name) ?? '<image/jpeg | image/png | image/webp | application/pdf>'
    return toolText('Send the file to this address within 10 minutes (once). The answer is { "upload": "<file ID>" }.', {
      upload_url: address,
      curl: `curl -sS -X POST -H 'Content-Type: ${type}' --data-binary @${shellWord(path)} '${address}'`,
    })
  }
  await ctx.runQuery(internal.agent.mayUpload, { key })
  const signal = AbortSignal.timeout(FETCH_MS)
  const fetched = await fetchPublic(url, signal)
  if ('refused' in fetched) return toolText(fetched.refused, undefined, true)
  const { response } = fetched
  if (!response.ok) {
    await response.body?.cancel()
    return toolText(t('en', 'errors.uploadFetchFailed', { url, status: response.status }), undefined, true)
  }
  const name = baseName(given) || lastSegment(fetched.url) || 'file'
  // Many file hosts answer with a generic type; then the name decides, and storeFile checks the bytes against it.
  const declared = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  const type = declared === '' || declared === 'application/octet-stream' ? typeOfName(name) ?? declared : declared
  const kind = kindOf(type)
  // Refused before the body is read: a type the library does not take, or more bytes than its limit.
  if (!kind) {
    await response.body?.cancel()
    return toolText(t('en', WRONG_TYPE.key, WRONG_TYPE.params), undefined, true)
  }
  let bytes: Uint8Array<ArrayBuffer> | undefined
  try {
    bytes = await readCapped(response, kind.limit)
  } catch {
    return toolText(t('en', 'errors.uploadFetchFailed', { url, status: signal.aborted ? 'no answer within 20 seconds' : 'network error' }), undefined, true)
  }
  if (!bytes) return toolText(t('en', TOO_LARGE.key, TOO_LARGE.params), undefined, true)
  const { ticket } = await ctx.runMutation(internal.agent.uploadTicket, { key })
  const owner = await ctx.runMutation(internal.uploads.redeem, { ticket })
  if (!owner) return toolText(t('en', 'errors.uploadExpired'), undefined, true)
  const stored = await storeFile(ctx, owner, name, type, bytes)
  if (!stored.ok) return toolText(t('en', stored.key, stored.params), undefined, true)
  const image = type.startsWith('image/')
  return toolText(`Uploaded “${name}” as file ${stored.upload}.${image ? ' The image is processed for a few seconds before the website shows it.' : ''}`, {
    file: stored.upload, name,
    ...(image ? { image_field: { file: stored.upload, alt: '' }, markdown: `![Description]($file.${stored.upload})` } : { file_field: { file: stored.upload }, markdown: `[${name}]($file.${stored.upload})` }),
  })
}

const mcp = httpAction(async (ctx, request) => {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  const admitted = KEY.test(token) ? await ctx.runMutation(internal.agent.admit, { hash: sha256(token) }) : { ok: false as const, code: 'UNAUTHORIZED' as const }
  if (!admitted.ok) {
    return admitted.code === 'RATE_LIMITED'
      ? rpcError(null, -32000, 'Too many calls. Wait a minute.', 429)
      : rpcError(null, -32001, 'The key is missing, invalid or revoked.', 401)
  }

  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > BODY_MAX) return rpcError(null, -32600, 'The request is too large.', 413)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return rpcError(null, -32700, 'The request is not valid JSON.', 400)
  }
  if (!isRpc(body)) return rpcError(null, -32600, 'This is not a JSON-RPC 2.0 request.', 400)
  // A notification (no id) gets no answer (MCP Streamable HTTP: 202).
  if (body.id === undefined) return reply(202)

  const { id, method, params = {} } = body
  if (method === 'initialize') {
    return result(id, { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'ginko', version: '1' }, instructions: INSTRUCTIONS })
  }
  if (method === 'ping') return result(id, {})
  if (method === 'tools/list') return result(id, { tools: await ctx.runQuery(internal.agent.tools, { key: admitted.key }) })
  if (method === 'tools/call') {
    const name = typeof params.name === 'string' ? params.name : ''
    const args = typeof params.arguments === 'object' && params.arguments !== null && !Array.isArray(params.arguments) ? params.arguments as Record<string, Json> : {}
    const answer = await callTool(ctx, admitted.key, name, args)
    const sized = new TextEncoder().encode(JSON.stringify(answer)).byteLength > ANSWER_MAX
      ? toolText('The answer would be too large. Ask for a single brick or fewer entries.', undefined, true)
      : answer
    return result(id, sized)
  }
  return rpcError(id, -32601, `The method “${method}” does not exist here.`)
})

// No SSE stream and no sessions: GET and DELETE are not offered (MCP Streamable HTTP allows 405).
const notOffered = httpAction(async () => reply(405, undefined, { allow: 'POST' }))

export function register(http: HttpRouter) {
  http.route({ path: '/mcp', method: 'POST', handler: mcp })
  http.route({ path: '/mcp', method: 'GET', handler: notOffered })
  http.route({ path: '/mcp', method: 'DELETE', handler: notOffered })
}
