// `pnpm local:dev` connects agents in the site folder to the local CMS: it keeps an agent key of the local admin in
// `<site>/.mcp.json` (server "ginko-local"), which Claude Code and other MCP hosts read. The key works only against
// the local backend; the same key is reused on every start, so the file does not change between runs.
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isObject } from './model.ts'

export const MCP_SERVER = 'ginko-local'
const AGENT_KEY = /^ginko_agent_[a-z0-9]{32}$/
const RETRY_MS = 15_000

/** A new agent key in the form the platform's door admits (`ginko_agent_` + 32 of a–z, 0–9). */
export function newAgentKey(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return `ginko_agent_${Array.from(randomBytes(32), (b) => alphabet[b % alphabet.length]).join('')}`
}

/**
 * The `.mcp.json` text with the local Ginko server set and every other server kept. A key already in the file is
 * reused. Undefined when the file exists but is not a JSON object: it is the person's, so it is not overwritten.
 */
export function withLocalAgent(text: string | undefined, mcpUrl: string, newKey: () => string = newAgentKey): { text: string; key: string } | undefined {
  let config: Record<string, unknown> = {}
  if (text?.trim()) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (!isObject(parsed)) return undefined
      config = parsed
    } catch {
      return undefined
    }
  }
  const servers = isObject(config.mcpServers) ? config.mcpServers : {}
  const old = servers[MCP_SERVER]
  const header = isObject(old) && isObject(old.headers) && typeof old.headers.Authorization === 'string' ? old.headers.Authorization.replace(/^Bearer /, '') : ''
  const key = AGENT_KEY.test(header) ? header : newKey()
  const next = { ...config, mcpServers: { ...servers, [MCP_SERVER]: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${key}` } } } }
  return { text: `${JSON.stringify(next, null, 2)}\n`, key }
}

export interface ConnectAgentsInput {
  siteDir: string
  /** The local backend's HTTP address (CONVEX_SITE_URL), where /mcp is served. */
  siteUrl: string
  site: string
  admin: string
  /** Runs `agent:devKey` on the local backend and returns its parsed result. */
  devKey: (args: { site: string; email: string; hash: string }) => Promise<Record<string, unknown> | undefined>
  log: (line: string) => void
  stopped: () => boolean
  wait?: (ms: number) => Promise<void>
}

/**
 * Registers the key of `.mcp.json` for the local admin and writes the file. The admin user exists only after the
 * first sign-in, so until then it asks again every 15 seconds while local:dev runs.
 */
export async function connectAgents(input: ConnectAgentsInput): Promise<boolean> {
  const { log } = input
  const file = join(input.siteDir, '.mcp.json')
  const before = existsSync(file) ? readFileSync(file, 'utf8') : undefined
  const next = withLocalAgent(before, `${input.siteUrl.replace(/\/$/, '')}/mcp`)
  if (!next) {
    log(`Agents: ${file} is not a JSON object, so it was left alone. Add the server "${MCP_SERVER}" yourself or fix the file.`)
    return false
  }
  const hash = createHash('sha256').update(next.key).digest('hex')
  const wait = input.wait ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms).unref()))
  let told = false
  while (!input.stopped()) {
    const result = await input.devKey({ site: input.site, email: input.admin, hash })
    if (result?.ok === true) {
      if (next.text !== before) writeFileSync(file, next.text)
      log(`Agents: .mcp.json in the site folder connects agents to the local CMS as ${input.admin} (server "${MCP_SERVER}"). Restart the agent to load it.`)
      // Status 1: inside a git repository and not ignored. The key works only locally, but it still does not belong in git.
      if (spawnSync('git', ['check-ignore', '-q', '.mcp.json'], { cwd: input.siteDir }).status === 1) log('Agents: add .mcp.json to .gitignore; it holds a local agent key.')
      return true
    }
    if (!told) {
      log(`Agents: sign in to the Studio once as ${input.admin}; then .mcp.json is written to the site folder.`)
      told = true
    }
    await wait(RETRY_MS)
  }
  return false
}
