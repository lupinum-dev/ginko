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
 * The `.mcp.json` text with the local Ginko server set and every other server kept. Without `key`, a key already in the
 * file is reused. Undefined when the file exists but is not a JSON object: it is the person's, so it is not overwritten.
 */
export function withLocalAgent(text: string | undefined, mcpUrl: string, key?: string): { text: string; key: string } | undefined {
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
  const use = key ?? (AGENT_KEY.test(header) ? header : newAgentKey())
  const next = { ...config, mcpServers: { ...servers, [MCP_SERVER]: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${use}` } } } }
  return { text: `${JSON.stringify(next, null, 2)}\n`, key: use }
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
 * first sign-in, so until then it asks again every 15 seconds while local:dev runs. A key the backend does not give
 * this admin (revoked, or another site's) is replaced by a new one. Stops when the backend cannot be asked.
 */
export async function connectAgents(input: ConnectAgentsInput): Promise<boolean> {
  const { log } = input
  const file = join(input.siteDir, '.mcp.json')
  const mcpUrl = `${input.siteUrl.replace(/\/$/, '')}/mcp`
  const read = () => (existsSync(file) ? readFileSync(file, 'utf8') : undefined)
  const notJson = () => log(`Agents: ${file} is not a JSON object, so it was left alone. Add the server "${MCP_SERVER}" yourself or fix the file.`)
  const first = withLocalAgent(read(), mcpUrl)
  if (!first) {
    notJson()
    return false
  }
  let key = first.key
  const wait = input.wait ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms).unref()))
  const told = new Set<string>()
  const tell = (reason: string, line: string) => {
    if (!told.has(reason)) log(line)
    told.add(reason)
  }
  while (!input.stopped()) {
    const result = await input.devKey({ site: input.site, email: input.admin, hash: createHash('sha256').update(key).digest('hex') })
    if (result?.ok === true) {
      // Read again: the person may have changed the file while local:dev waited for the sign-in.
      const before = read()
      const next = withLocalAgent(before, mcpUrl, key)
      if (!next) {
        notJson()
        return false
      }
      if (next.text !== before) writeFileSync(file, next.text)
      log(`Agents: .mcp.json in the site folder connects agents to the local CMS as ${input.admin} (server "${MCP_SERVER}"). Restart the agent to load it.`)
      // Status 1: inside a git repository and not ignored. The key works only locally, but it still does not belong in git.
      if (spawnSync('git', ['check-ignore', '-q', '.mcp.json'], { cwd: input.siteDir }).status === 1) log('Agents: add .mcp.json to .gitignore; it holds a local agent key.')
      return true
    }
    const reason = result?.reason
    if (reason === 'taken') {
      key = newAgentKey()
      continue
    }
    if (reason === 'signin') tell(reason, `Agents: sign in to the Studio once as ${input.admin}; then .mcp.json is written to the site folder.`)
    else if (reason === 'site') tell(reason, `Agents: the site “${input.site}” is not on the local backend yet; .mcp.json follows once it is.`)
    else {
      log('Agents: the local backend did not answer, so .mcp.json was not written. It is written on the next start.')
      return false
    }
    await wait(RETRY_MS)
  }
  return false
}
