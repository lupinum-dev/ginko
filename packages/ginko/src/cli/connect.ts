// `ginko connect <address>`: gives this website folder a publishing key without anyone copying it (server: connect.ts).
// The command opens a request, shows a code and the Studio page, and polls until a person confirmed the code there.
// The key then goes into the GitHub secret GINKO_KEY (with `gh`, after a yes) or is shown once on stderr. The JSON line
// on stdout never holds it. Writes no file.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { loadConfig } from './config.ts'
import { CliError, isObject } from './model.ts'
import { checkPlatformUrl, discoverPlatform, PlatformError } from './platform.ts'
import type { CliDeps } from './run.ts'

/** What the command needs beyond CliDeps: a browser, other programs, a question, the clock. Tests replace it. */
export interface ConnectIO {
  /** Opens the address in the person's browser. Never throws: the address is printed anyway. */
  open: (url: string) => void
  /** Runs a program with `input` on stdin. Rejects when the program does not exist. */
  run: (command: string, args: string[], input?: string) => Promise<{ code: number; stdout: string }>
  /** Asks one question on the terminal; undefined when there is no terminal to ask in. */
  ask: (question: string) => Promise<string | undefined>
  sleep: (ms: number) => Promise<void>
  /** The website folder; its name is the label the Studio shows. */
  cwd: () => string
}

export function realConnectIO(): ConnectIO {
  return {
    open(url) {
      // `url` is a checked http(s) address (`verifyUrlOf`) and goes to the opener as one argument, never through a shell.
      // Windows: rundll32 with url.dll opens it in the default browser; `cmd /c start` would read `&` in a query as a
      // second command.
      const [command, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]]
      try {
        const child = spawn(command, args, { stdio: 'ignore', detached: true, shell: false })
        child.on('error', () => {})
        child.unref()
      } catch {
        // No browser opener: the address is on the screen.
      }
    },
    run: (command, args, input) => new Promise((done, fail) => {
      const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'] })
      let stdout = ''
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      child.on('error', fail)
      child.on('close', (code) => done({ code: code ?? 1, stdout }))
      child.stdin.end(input ?? '')
    }),
    async ask(question) {
      if (!process.stdin.isTTY || !process.stderr.isTTY) return undefined
      const prompt = createInterface({ input: process.stdin, output: process.stderr })
      try {
        return await prompt.question(question)
      } finally {
        prompt.close()
      }
    },
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    cwd: () => process.cwd(),
  }
}

const TIMEOUT_MS = 30_000
const LABEL_MAX = 60
export const storeQuestion = (repository: string) => `Store the key as the secret GINKO_KEY and the address as the variable GINKO_PLATFORM of the GitHub repository ${repository}? Existing values are replaced. (y/n) `

/**
 * The confirmation page from the platform's answer, checked before it is printed or opened: the answer is untrusted (a
 * person can be talked into connecting to someone else's address), and an opener takes any scheme (`file:`, an app).
 * Only https, plain http on the machine itself, and no user name or password in it.
 */
export function verifyUrlOf(value: string): string {
  const url = URL.canParse(value) ? new URL(value) : undefined
  const local = !!url && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  const scheme = !!url && (url.protocol === 'https:' || (url.protocol === 'http:' && local))
  if (!url || !scheme || url.username || url.password) throw new PlatformError('INVALID_ANSWER', 'The platform named a confirmation page that is not an http(s) address. Nothing was opened.', 502)
  return url.href
}

interface Started { deviceCode: string; userCode: string; verifyUrl: string; interval: number; expiresIn: number }

/** One POST to the backend. Messages are fixed English text: the body may hold the device code, never quoted. */
async function post(fetch: CliDeps['fetch'], url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  let response: Response
  let text: string
  try {
    response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) })
    text = await response.text()
  } catch {
    throw new CliError('The platform is not reachable. Check the address and your network.', 'UNAVAILABLE')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }
  return { status: response.status, body: isObject(parsed) ? parsed : {} }
}

function isStarted(body: Record<string, unknown>): body is Record<string, unknown> & Started {
  return typeof body.deviceCode === 'string' && typeof body.userCode === 'string' && typeof body.verifyUrl === 'string'
    && typeof body.interval === 'number' && typeof body.expiresIn === 'number'
}

/** Polls until the request is confirmed (the key), refused or over. Network trouble and 5xx answers are tried again. */
async function waitForKey(input: { fetch: CliDeps['fetch']; io: ConnectIO; backend: string; started: Started }): Promise<{ site: string; key: string }> {
  const { started } = input
  const deadline = Date.now() + started.expiresIn * 1000
  const interval = Math.max(1, started.interval) * 1000
  while (Date.now() < deadline) {
    await input.io.sleep(interval)
    let answer: Awaited<ReturnType<typeof post>>
    try {
      answer = await post(input.fetch, `${input.backend}/connect/poll`, { deviceCode: started.deviceCode })
    } catch {
      continue
    }
    if (answer.status === 200 && typeof answer.body.site === 'string' && typeof answer.body.key === 'string') return { site: answer.body.site, key: answer.body.key }
    if (answer.status === 200 && answer.body.status === 'pending') continue
    if (answer.status >= 500 || answer.status === 429) continue
    throw new CliError('The request was declined or is no longer valid. Start again with ginko connect.', 'INVALID')
  }
  throw new CliError('Nobody confirmed the code in time. Start again with ginko connect.', 'INVALID')
}

/** The `site` of ginko.config.ts, or undefined when the file is missing or does not load. */
async function configuredSite(path: string): Promise<string | undefined> {
  if (!existsSync(path)) return undefined
  try {
    return (await loadConfig(path)).site
  } catch {
    return undefined
  }
}

/** Stores key and address with `gh` after a yes. False when gh is missing, the folder is no GitHub repository, gh names no repository, there is no terminal or the answer is no. */
async function storeOnGitHub(input: { io: ConnectIO; log: CliDeps['log']; key: string; address: string }): Promise<boolean> {
  const { io, log } = input
  // The question names the repository gh would write to; without a readable name it is not asked.
  let repository: unknown
  try {
    const view = await io.run('gh', ['repo', 'view', '--json', 'nameWithOwner'])
    if (view.code !== 0) return false
    repository = (JSON.parse(view.stdout) as { nameWithOwner?: unknown }).nameWithOwner
  } catch {
    return false
  }
  if (typeof repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repository)) return false
  const answer = (await io.ask(storeQuestion(repository)))?.trim().toLowerCase()
  if (answer !== 'y' && answer !== 'yes') return false
  // The key goes over stdin, never as an argument: arguments are visible to other processes.
  if ((await io.run('gh', ['secret', 'set', 'GINKO_KEY'], input.key)).code !== 0) {
    log('gh could not store the secret GINKO_KEY.')
    return false
  }
  if ((await io.run('gh', ['variable', 'set', 'GINKO_PLATFORM', '--body', input.address])).code !== 0) {
    log(`The secret GINKO_KEY is stored, but gh could not set the variable GINKO_PLATFORM. Set it with: gh variable set GINKO_PLATFORM --body ${input.address}`)
  } else log('Stored the secret GINKO_KEY and the variable GINKO_PLATFORM on GitHub.')
  return true
}

export async function connect(input: { address: string | undefined; configPath?: string; deps: CliDeps; io: ConnectIO }): Promise<{ site: string; stored: 'github' | 'shown' }> {
  const { deps, io } = input
  if (!input.address) throw new CliError('ginko connect needs the Studio address: ginko connect https://cms.example.com', 'USAGE')
  const address = input.address.replace(/\/+$/, '')
  try {
    checkPlatformUrl(address)
  } catch {
    throw new CliError('The address must start with https:// (http:// only for localhost, 127.0.0.1 and [::1]).', 'USAGE')
  }
  let backend: string
  try {
    ({ backend } = await discoverPlatform(address, deps.fetch))
  } catch {
    throw new CliError('The Studio at this address names a backend address that is not https:// (/.well-known/ginko-platform).', 'USAGE')
  }
  const label = basename(io.cwd()).slice(0, LABEL_MAX).trim() || 'website'
  const opened = await post(deps.fetch, `${backend}/connect/start`, { label })
  if (opened.status !== 200 || !isStarted(opened.body)) {
    if (opened.status === 404) throw new CliError('This platform does not offer ginko connect (HTTP 404). Update it, or make a key on its Team page.', 'USAGE')
    const code = typeof opened.body.code === 'string' ? opened.body.code : `HTTP_${opened.status}`
    const message = typeof opened.body.message === 'string' ? opened.body.message : `The platform responded with HTTP ${opened.status}.`
    throw new PlatformError(code, message, opened.status)
  }
  const started = opened.body
  const verifyUrl = verifyUrlOf(started.verifyUrl)
  deps.log(`Open ${verifyUrl} and enter this code: ${started.userCode}`)
  deps.log(`Waiting for the confirmation (at most ${Math.round(started.expiresIn / 60)} minutes) …`)
  io.open(verifyUrl)

  const { site, key } = await waitForKey({ fetch: deps.fetch, io, backend, started })
  deps.log(`Connected to the site “${site}”.`)

  const configPath = input.configPath ?? resolve(io.cwd(), 'ginko.config.ts')
  const configured = await configuredSite(configPath)
  if (configured !== site) deps.log(`Set this in ${basename(configPath)}: site: '${site}',`)

  if (await storeOnGitHub({ io, log: deps.log, key, address })) return { site, stored: 'github' }
  deps.log('This is the publishing key. It is shown only now; store it as the secret GINKO_KEY of your CI:')
  deps.log(key)
  return { site, stored: 'shown' }
}
