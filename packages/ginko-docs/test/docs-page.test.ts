import { describe, expect, it } from 'vitest'
import { buildIndex } from '@lupinum/ginko/internal/search'
import { loadIndex, search } from '@lupinum/ginko/search'
import { handleMcp, type DocsMcpDeps } from '../server/mcp/handler'
import { docsAskLinks, docsEditUrl, docsMarkdownPath, docsStudioUrl } from '../app/utils/docsPage'

describe('page helpers', () => {
  it.each([
    [{ url: 'https://github.com/a/b' }, 'sites/docs/x.en.md', 'https://github.com/a/b/edit/main/sites/docs/x.en.md'],
    [{ url: 'https://github.com/a/b/', branch: 'dev' }, 'x.md', 'https://github.com/a/b/edit/dev/x.md'],
    [{ url: 'https://gl.example/a', editUrl: '{url}/-/edit/{branch}/{source}' }, 'x.md', 'https://gl.example/a/-/edit/main/x.md'],
    [{ url: 'https://github.com/a/b' }, undefined, undefined],
    [undefined, 'x.md', undefined],
  ])('edit url %#', (repo, source, expected) => expect(docsEditUrl(repo, source)).toBe(expected))

  it('a platform page links to its Studio form; without a platform address there is no link', () => {
    expect(docsStudioUrl('https://studio.example/', 'lupinum', 'docs', 'k17 x')).toBe('https://studio.example/s/lupinum/all/docs/k17%20x')
    expect(docsStudioUrl('', 'lupinum', 'docs', 'k17')).toBeUndefined()
  })

  it.each([['/en/docs/languages', '/en/docs/languages.md'], ['/docs/x/', '/docs/x.md'], ['/', '/index.md']])('markdown twin of %s', (path, md) => expect(docsMarkdownPath(path)).toBe(md))

  it('ask links carry the encoded prompt', () => {
    const { chatGpt, claude } = docsAskLinks('Lies https://x.dev/a.md & fertig')
    expect(chatGpt).toBe('https://chatgpt.com/?q=Lies%20https%3A%2F%2Fx.dev%2Fa.md%20%26%20fertig')
    expect(claude.startsWith('https://claude.ai/new?q=')).toBe(true)
  })
})

describe('docs MCP', () => {
  const index = buildIndex([
    { id: 'a', url: '/docs/sprachen', title: 'Sprachen', heading: 'Übersetzen', text: 'Jede Seite gibt es in mehreren Sprachen.', excerpt: 'Jede Seite gibt es', brick: 'docs', locale: 'de' },
    { id: 'b', url: '/docs/start', title: 'Einstieg', text: 'So fängt man an.', excerpt: 'So fängt man an.', brick: 'docs', locale: 'de' },
  ], 'de').then(loadIndex)
  const deps: DocsMcpDeps = {
    search: async (q) => search(await index, q),
    read: (path) => (path === '/docs/start' ? '# Einstieg\n\nSo fängt man an.' : undefined),
  }
  const call = (method: string, params?: object) => handleMcp({ jsonrpc: '2.0', id: 1, method, params }, deps) as Promise<any>

  it('initializes and lists the two tools', async () => {
    expect((await call('initialize')).result.capabilities).toEqual({ tools: {} })
    expect((await call('tools/list')).result.tools.map((t: { name: string }) => t.name)).toEqual(['search_docs', 'read_doc'])
    expect(await handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps)).toBeUndefined()
  })

  it('searches and reads', async () => {
    const found = await call('tools/call', { name: 'search_docs', arguments: { query: 'Übersetzen' } })
    expect(found.result.content[0].text).toContain('/docs/sprachen')
    const page = await call('tools/call', { name: 'read_doc', arguments: { path: '/docs/start.md' } })
    expect(page.result.content[0].text.startsWith('# Einstieg')).toBe(true)
  })

  it('reports bad input as tool errors and unknown things as JSON-RPC errors', async () => {
    expect((await call('tools/call', { name: 'read_doc', arguments: { path: '/nope' } })).result.isError).toBe(true)
    expect((await call('tools/call', { name: 'read_doc', arguments: { path: '//evil.test/x' } })).result.isError).toBe(true)
    expect((await call('tools/call', { name: 'delete_doc' })).error.code).toBe(-32602)
    expect((await call('resources/list')).error.code).toBe(-32601)
  })
})
