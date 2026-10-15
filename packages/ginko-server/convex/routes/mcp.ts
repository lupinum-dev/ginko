// POST /mcp: the agent door (SPEC 16) as MCP Streamable HTTP, stateless: one JSON-RPC request in, one
// JSON answer out, no SSE, no session. Order: key and rate limit, then the method. Tool failures are
// tool results with `isError` and the English message, so the assistant can tell the person.
import type { Json } from '@lupinum/ginko'
import { coreMessage, sha256, SITE_BUDGET } from '@lupinum/ginko/internal'
import type { HttpRouter } from 'convex/server'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { httpAction, type ActionCtx } from '../_generated/server'
import { READ_TOOLS } from '../lib/agentTools'
import { badKey } from '../lib/input'
import { t, type MessageKey } from '../lib/i18n'

const PROTOCOL = '2025-06-18'
/** An answer holds at least one whole entry the Studio can save (SITE_BUDGET.entryBytes) plus room for its wrapping. */
const ANSWER_MAX = SITE_BUDGET.entryBytes + 64 * 1024
const BODY_MAX = 512 * 1024
const KEY = /^ginko_agent_[a-z0-9]{32}$/

// Written for the model, in English whatever the language of the site: the model answers the person in theirs.
const INSTRUCTIONS = 'Ginko maintains the content of one website for one person. Call ginko_overview first. Every task is a tool. '
  + 'Changes are live in about a minute and can be taken back with ginko_undo. Ask the person before removing anything. '
  + 'When you retry a change, send the same request_id, so it runs only once. '
  + 'Texts that belong to the website stay in the language of the website; answer the person in their own language.'

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
    const { message, key, params, details } = data as { message: string; key?: string; params?: Record<string, string | number>; details?: { errors?: { message: string; key?: string; params?: Record<string, string | number> }[] } }
    const head = key ? t('en', key as MessageKey, params) : message
    const issues = details?.errors?.map((e) => (e.key ? coreMessage('en', e.key, e.params) : e.message)) ?? []
    return issues.length ? `${head} ${issues.join(' ')}` : head
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
    if (READ_TOOLS.has(name)) {
      const done = await ctx.runQuery(internal.agent.lookup, { key, name, args })
      return toolText(done.text, done.result)
    }
    const done = await ctx.runMutation(internal.agent.call, { key, name, args })
    return toolText(done.text, done.result)
  } catch (error) {
    return toolText(messageOf(error), undefined, true)
  }
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
