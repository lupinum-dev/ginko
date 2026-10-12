// Read-only MCP server for the docs, minimal MCP Streamable HTTP: one JSON-RPC request in, one JSON response out.
// Methods: initialize, ping, tools/list, tools/call (search_docs, read_doc). No sessions, no streaming, no auth:
// it only returns what the public site already shows. Pure (the data comes in through `deps`), so tests call it directly.

export interface DocsMcpHit { title: string, heading?: string, url: string, excerpt: string }
export interface DocsMcpDeps {
  search: (query: string, locale?: string) => DocsMcpHit[] | Promise<DocsMcpHit[]>
  /** Markdown of the page at `path`, or undefined when there is none. */
  read: (path: string) => string | undefined | Promise<string | undefined>
}

const PROTOCOL = '2025-03-26'
const TOOLS = [
  {
    name: 'search_docs',
    description: 'Search the documentation. Returns the best matching pages and sections with their path and an excerpt.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, locale: { type: 'string', description: 'Language code, e.g. "en". Default: the main language.' } }, required: ['query'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'read_doc',
    description: 'Read one documentation page as Markdown. `path` is the page path from search_docs, e.g. "/en/docs/languages".',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    annotations: { readOnlyHint: true },
  },
]

type Json = Record<string, unknown>
const ok = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result })
const fail = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
const text = (value: string, isError = false) => ({ content: [{ type: 'text', text: value }], ...(isError ? { isError: true } : {}) })

async function callTool(params: Json, deps: DocsMcpDeps) {
  const args = (params.arguments ?? {}) as Json
  if (params.name === 'search_docs') {
    if (typeof args.query !== 'string' || !args.query.trim()) return text('`query` must be a non-empty string.', true)
    const hits = await deps.search(args.query, typeof args.locale === 'string' ? args.locale : undefined)
    return text(hits.length
      ? hits.map((h) => `- ${h.heading ? `${h.title} > ${h.heading}` : h.title}: ${h.url}${h.excerpt ? `\n  ${h.excerpt}` : ''}`).join('\n')
      : 'No results.')
  }
  if (params.name === 'read_doc') {
    // A path of this site only: starts with "/", no scheme-relative "//", no "..".
    if (typeof args.path !== 'string' || !/^\/(?!\/)/.test(args.path) || args.path.split('/').includes('..')) return text('`path` must be a page path like "/en/docs/languages".', true)
    const markdown = await deps.read(args.path.replace(/\.md$/, ''))
    return markdown === undefined ? text(`No page at ${args.path}.`, true) : text(markdown)
  }
  return undefined
}

/** One JSON-RPC message. `undefined` means "no response" (a notification). */
export async function handleMcpMessage(message: unknown, deps: DocsMcpDeps): Promise<Json | undefined> {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return fail(null, -32600, 'Invalid request')
  const { id, method, params } = message as { id?: unknown, method?: unknown, params?: Json }
  if (typeof method !== 'string') return fail(id, -32600, 'Invalid request')
  if (id === undefined) return undefined // notifications such as notifications/initialized
  switch (method) {
    case 'initialize':
      return ok(id, { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'ginko-docs', version: '1' } })
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: TOOLS })
    case 'tools/call': {
      const result = await callTool(params ?? {}, deps)
      return result === undefined ? fail(id, -32602, `Unknown tool: ${String(params?.name)}`) : ok(id, result)
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`)
  }
}

/** A request body: one message, or a batch of them. */
export async function handleMcp(body: unknown, deps: DocsMcpDeps): Promise<Json | Json[] | undefined> {
  if (!Array.isArray(body)) return handleMcpMessage(body, deps)
  const out = (await Promise.all(body.map((m) => handleMcpMessage(m, deps)))).filter((r): r is Json => r !== undefined)
  return out.length ? out : undefined
}
