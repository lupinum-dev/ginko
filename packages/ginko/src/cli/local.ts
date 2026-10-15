// The local Convex deployment, shared by the monorepo tools that write to it (`local:dev`, `local:import`,
// `local:pull`): finding packages/ginko-server (the Convex project), confirming that the Convex CLI points at the
// LOCAL backend before any write, and running `npx convex run` against exactly that deployment.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CliError, isObject } from './model.ts'

/**
 * Walks up from the site folder (then from the working directory) to the monorepo and returns its Convex project, packages/ginko-server:
 * the folder with convex.json, where `convex dev` runs and writes .env.local.
 */
export function findBackend(from: string, command = 'local:dev'): string {
  // Above the site first (sites/<name> in the monorepo), then above the working directory, so a site in its own
  // repository runs with `pnpm local:dev --config <path>` from the monorepo root.
  for (const start of [from, process.cwd()]) {
    let dir = start
    for (;;) {
      const candidate = join(dir, 'packages', 'ginko-server')
      if (existsSync(join(candidate, 'package.json'))) return candidate
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  throw new CliError(`packages/ginko-server was not found. Run \`${command}\` from the Ginko monorepo.`, 'USAGE')
}

/** The Convex deployment that a command writes to. Empty values are missing, not guessed. */
export interface DeploymentTarget {
  deployment?: string
  url?: string
  /** Cloud credentials found in the environment or the env files; the Convex CLI prefers them over CONVEX_DEPLOYMENT. */
  cloudKeys?: string[]
}

/** Variables with which the Convex CLI targets a deployment other than the one CONVEX_DEPLOYMENT names. */
const CLOUD_KEYS = ['CONVEX_DEPLOY_KEY', 'CONVEX_SELF_HOSTED_ADMIN_KEY', 'CONVEX_SELF_HOSTED_URL'] as const

/**
 * Returns an English error when the target is not the local backend, otherwise undefined.
 * A selected deployment name decides alone: it must be the local anonymous one. Without a name, the URL must be local.
 */
export function localDeploymentError(target: DeploymentTarget, command = 'local:dev'): string | undefined {
  // A deploy key wins over CONVEX_DEPLOYMENT in the Convex CLI: with one set, a local command would write to the cloud (Astra 9).
  if (target.cloudKeys?.length) return `${command} stopped: ${target.cloudKeys.join(', ')} is set. This makes Convex write to a cloud deployment, not to the local backend. Remove it for local commands. Nothing was written.`
  const deployment = target.deployment?.trim()
  if (deployment) {
    // Like the Convex CLI (deployment.ts isAnonymousDeployment): the name after the type prefix decides. Convex 1.46
    // writes `anonymous:anonymous-agent`.
    return deployment.split(':').at(-1)!.startsWith('anonymous-')
      ? undefined
      : `${command} stopped: Convex chose the target “${deployment}”, not the local backend (anonymous-…). Nothing was written.`
  }
  const url = target.url?.trim()
  if (!url) return `${command} stopped: the Convex target is not confirmed (CONVEX_DEPLOYMENT is missing). Nothing was written.`
  if (!isLocalUrl(url)) return `${command} stopped: the Convex URL “${url}” is not local. Nothing was written.`
  return undefined
}

/**
 * Like localDeploymentError, for the check before `convex dev` starts: a fresh checkout has no target yet
 * (the anonymous setup creates .env.local), so only a known target that is not local is refused.
 */
export function knownTargetError(target: DeploymentTarget, command = 'local:dev'): string | undefined {
  if (!target.cloudKeys?.length && !target.deployment?.trim() && !target.url?.trim()) return undefined
  return localDeploymentError(target, command)
}

function isLocalUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === '127.0.0.1' || hostname === 'localhost'
  } catch {
    return false
  }
}

/** The target as the Convex CLI sees it: process environment first, then packages/ginko-server/.env.local (its own precedence). */
export function readDeploymentTarget(backendDir: string): DeploymentTarget {
  const file = parseEnvFile(join(backendDir, '.env.local'))
  const dotenv = parseEnvFile(join(backendDir, '.env'))
  return {
    deployment: process.env.CONVEX_DEPLOYMENT || file.CONVEX_DEPLOYMENT,
    url: process.env.CONVEX_URL || file.CONVEX_URL,
    cloudKeys: CLOUD_KEYS.filter((key) => process.env[key] || file[key] || dotenv[key]),
  }
}

function parseEnvFile(path: string): Record<string, string> {
  return existsSync(path) ? parseEnvText(readFileSync(path, 'utf8')) : {}
}

/** NAME=value lines, as in an env file and in `convex env list`. */
function parseEnvText(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (match) values[match[1]!] = match[2]!.replace(/^["']|["']$/g, '')
  }
  return values
}

/** Pins the Convex CLI to the verified deployment for one command. */
export function targetEnv(target: DeploymentTarget): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of CLOUD_KEYS) delete env[key]
  return {
    ...env,
    ...(target.deployment ? { CONVEX_DEPLOYMENT: target.deployment } : {}),
    ...(target.url ? { CONVEX_URL: target.url } : {}),
  }
}

/** The deployment the Convex CLI selects in backendDir. Throws before anything is written when it is not the local backend. */
export function confirmLocal(backendDir: string, command = 'local:dev'): DeploymentTarget {
  const target = readDeploymentTarget(backendDir)
  const problem = localDeploymentError(target, command)
  if (problem) throw new CliError(problem, 'USAGE')
  return target
}

/** The address the local Studio runs on (apps/platform `pnpm dev`, the e2e tests). */
export const LOCAL_STUDIO = 'http://localhost:3100'

/**
 * Prepares the LOCAL backend for sign-in: the environment variables the platform needs (only those still missing;
 * GINKO_LOCAL must be 1), the same proxy secret and site URL in backendDir/.env.local for the Nuxt side, and the auth
 * signing key. Run it before the platform starts: the platform reads .env.local once. Returns the admin address to sign
 * in with (the first of GINKO_ADMIN_EMAILS; an operator's own value is kept). `run` is runOnce outside tests.
 */
export async function prepareLocalBackend(backendDir: string, command: string, log: (line: string) => void, run: typeof runOnce): Promise<string> {
  const env = targetEnv(confirmLocal(backendDir, command))
  const convex = (...args: string[]) => run('npx', ['convex', ...args], backendDir, env)
  const envFile = join(backendDir, '.env.local')
  const before = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
  const local = parseEnvText(before)
  const secret = () => randomBytes(32).toString('hex')
  const wanted: Record<string, () => string> = {
    GINKO_LOCAL: () => '1',
    GINKO_MAIL: () => 'outbox',
    SITE_URL: () => LOCAL_STUDIO,
    GINKO_ADMIN_EMAILS: () => 'admin@example.test',
    BETTER_AUTH_SECRETS: () => `0:${secret()}`,
    BCN_AUTH_PROXY_IP_SECRET: () => local.BCN_AUTH_PROXY_IP_SECRET || secret(),
  }
  // The backend's values after this function: what `env list` showed plus what is set below. No `env get` per name:
  // every Convex CLI call costs a second or two on each start.
  const values = parseEnvText(await convex('env', 'list'))
  for (const [name, value] of Object.entries(wanted)) {
    // The platform reads GINKO_LOCAL inside Convex (SPEC 5.3): a backend with another value must not keep it.
    if (name === 'GINKO_LOCAL' ? values[name] === '1' : values[name] !== undefined) continue
    values[name] = value()
    await convex('env', 'set', name, values[name])
    log(`set ${name}`)
  }
  // The Nuxt side must send the same proxy secret and know the same site URL, or sign-in returns 403.
  let file = before
  for (const name of ['BCN_AUTH_PROXY_IP_SECRET', 'SITE_URL']) {
    const value = values[name]
    if (local[name] === value) continue
    const line = `${name}=${value}`
    const pattern = new RegExp(`^${name}=.*$`, 'm')
    file = pattern.test(file) ? file.replace(pattern, line) : `${file.replace(/\n?$/, '\n')}${line}\n`
    log(`wrote ${name} to packages/ginko-server/.env.local`)
  }
  if (file !== before) writeFileSync(envFile, file)
  await convex('run', 'auth:ensureSigningKey')
  return values.GINKO_ADMIN_EMAILS!.split(',')[0]!.trim()
}

/** Runs one function of the local platform with JSON arguments and returns its JSON result. */
export type Runner = (fn: string, args: Record<string, unknown>) => Promise<unknown>

/**
 * Confirms the local deployment and returns the runner for it. Throws before anything is written when
 * the Convex CLI points anywhere else. `from` is the folder to search packages/ginko-server upwards from.
 */
export function connectLocal(from: string, command: string): Runner {
  const backendDir = findBackend(from, command)
  const env = targetEnv(confirmLocal(backendDir, command))
  return async (fn, args) => parseOutput(await runOnce('npx', ['convex', 'run', fn, JSON.stringify(args)], backendDir, env))
}

/** The JSON value that `convex run` prints; it may be preceded by progress lines. Undefined when there is none. */
export function parseOutput(output: string): unknown {
  const text = output.trim()
  for (const candidate of [text, text.split('\n').pop() ?? '']) {
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      // try the next form
    }
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown
  } catch {
    return undefined
  }
}

/** The object that `convex run` prints, or undefined when the output is something else. */
export function parseResult(output: string): Record<string, unknown> | undefined {
  const value = parseOutput(output)
  return isObject(value) ? value : undefined
}

/**
 * The reason in the stderr of a failed `convex run`. A function error is one line, "Uncaught ConvexError: …", above a
 * stack trace that is not useful here. A system error spans lines: "✖ Failed to run function …:", then
 * "Error: [Request ID: …] Server Error", then the cause ("Function execution timed out (maximum duration: 1s)"), all in
 * colour codes; its first line alone hides the cause.
 */
export function failureOf(stderr: string): string {
  const lines = stderr.replace(/\u001b\[[0-9;]*m/g, '').split('\n').map((line) => line.trim()).filter(Boolean)
  const uncaught = lines.find((line) => line.startsWith('Uncaught'))
  if (uncaught) return uncaught
  const failed = lines.findIndex((line) => line.includes('Failed to run function'))
  if (failed >= 0) return lines.slice(failed).filter((line) => !line.startsWith('at ')).join(' ')
  return lines[0] ?? ''
}

/** Runs a command to its end and returns its stdout. A failing command throws with the reason in its stderr. */
export function runOnce(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { out += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { err += chunk })
    child.on('error', fail)
    child.on('close', (code) => {
      if (code === 0) return done(out)
      fail(new CliError(`${command} ${args.slice(0, 2).join(' ')} exited with code ${code}: ${failureOf(err)}`))
    })
  })
}

/**
 * The runner for the HOSTED platform (`pnpm ops:import`): every call is `npx convex run --prod`, in packages/ginko-server,
 * with the credentials the Convex CLI finds (login or CONVEX_DEPLOY_KEY). The caller has made the operator say `--prod`.
 */
export function connectProd(from: string, command: string): Runner {
  const backendDir = findBackend(from, command)
  return async (fn, args) => parseOutput(await runOnce('npx', ['convex', 'run', '--prod', fn, JSON.stringify(args)], backendDir))
}
