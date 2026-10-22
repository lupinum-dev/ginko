// local:dev writes `.mcp.json` into the site folder so agents there reach the local CMS (cli/agent-config.ts).
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { connectAgents, newAgentKey, withLocalAgent } from '../../src/cli/agent-config.ts'

const URL = 'http://127.0.0.1:3211/mcp'

describe('withLocalAgent', () => {
  // Wrong behaviour caught: local:dev wipes the person's other MCP servers, or writes a new key on every start.
  it('keeps other servers and settings and reuses the key already in the file', () => {
    const first = withLocalAgent(JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } }, other: 1 }), URL, () => `ginko_agent_${'b'.repeat(32)}`)!
    expect(JSON.parse(first.text)).toEqual({
      other: 1,
      mcpServers: { github: { command: 'gh-mcp' }, 'ginko-local': { type: 'http', url: URL, headers: { Authorization: `Bearer ginko_agent_${'b'.repeat(32)}` } } },
    })
    const again = withLocalAgent(first.text, URL, () => { throw new Error('no new key') })!
    expect(again).toEqual(first)
  })

  it('leaves a file that is not a JSON object alone', () => {
    expect(withLocalAgent('{ broken', URL)).toBeUndefined()
    expect(withLocalAgent('[]', URL)).toBeUndefined()
  })

  it('makes keys the door admits', () => {
    expect(newAgentKey()).toMatch(/^ginko_agent_[a-z0-9]{32}$/)
  })
})

describe('connectAgents', () => {
  it('writes .mcp.json only once the admin has signed in, with the key whose hash it registered', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ginko-agents-'))
    writeFileSync(join(dir, '.mcp.json'), '{}')
    const answers = [{ ok: false, reason: 'signin' }, { ok: true }]
    const hashes: string[] = []
    const logs: string[] = []
    const done = await connectAgents({
      siteDir: dir, siteUrl: 'http://127.0.0.1:3211/', site: 'praxis', admin: 'admin@example.test', log: (l) => logs.push(l), stopped: () => false,
      wait: async () => { expect(readFileSync(join(dir, '.mcp.json'), 'utf8')).toBe('{}') },
      devKey: async (args) => { hashes.push(args.hash); return answers.shift() },
    })
    expect(done).toBe(true)
    const written = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'))
    const key = written.mcpServers['ginko-local'].headers.Authorization.replace('Bearer ', '')
    expect(written.mcpServers['ginko-local'].url).toBe(URL)
    expect(hashes).toEqual(Array(2).fill(createHash('sha256').update(key).digest('hex')))
    expect(logs[0]).toContain('sign in to the Studio once as admin@example.test')
  })
})
