import { describe, expect, it } from 'vitest'
import { handleMcp, MAX_BATCH, type DocsMcpDeps } from '../server/mcp/handler'

const read: string[] = []
const deps: DocsMcpDeps = {
  search: () => [{ title: 'Languages', url: '/en/docs/languages', excerpt: 'Set the locales.' }],
  read: (path) => { read.push(path); return path === '/en/docs/languages' ? '# Languages' : undefined },
}
const call = (name: string, args: Record<string, unknown>) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
const textOf = (response: unknown) => (response as { result: { content: { text: string }[], isError?: boolean } }).result

describe('docs MCP endpoint', () => {
  it('reads a page path as Markdown', async () => {
    expect(textOf(await handleMcp(call('read_doc', { path: '/en/docs/languages.md' }), deps))).toEqual({ content: [{ type: 'text', text: '# Languages' }] })
  })

  it.each(['/__ginko/search/en.json?', '/en/docs#x', '//evil.example/a', '/en/../__ginko', 'en/docs'])('refuses %s without a lookup', async (path) => {
    read.length = 0
    expect(textOf(await handleMcp(call('read_doc', { path }), deps)).isError).toBe(true)
    expect(read).toEqual([])
  })

  it('refuses an empty or oversized batch', async () => {
    const ping = { jsonrpc: '2.0', id: 1, method: 'ping' }
    expect(await handleMcp([ping, ping], deps)).toHaveLength(2)
    for (const batch of [[], Array.from({ length: MAX_BATCH + 1 }, () => ping)]) {
      expect(await handleMcp(batch, deps)).toMatchObject({ error: { code: -32600 } })
    }
  })
})
