// HTTP client for the platform's release routes (SPEC 5.1 step 2 and 5). The fetch is injected,
// so tests route it into convex-test. The push key is sent only as a bearer header, never printed.
import type { Schema } from '../core/index.ts'
import { CliError, isObject, parseExport, parseReleaseState, type ExportAnswer, type ReleaseState, type Write } from './model.ts'

/** A platform answer with an error: code and German message from the platform (SPEC 11). */
export class PlatformError extends Error {
  readonly code: string
  readonly status: number
  readonly details: unknown

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

export interface ReleaseBody {
  site: string
  commit: string
  expectedSchemaRev: number
  expectedContentRev: number
  schema: Schema
  writes: Write[]
}

export interface Platform {
  state(site: string): Promise<ReleaseState>
  release(body: ReleaseBody): Promise<{ schemaRev: number; contentRev: number }>
  /** GET /export (SPEC 9, 12): everything of the site, with signed file URLs. Needs scope export or pull. */
  exportSite(site: string): Promise<ExportAnswer>
}

export interface PlatformOptions {
  /** Base URL of the platform, e.g. https://platform.example */
  url: string
  key: string
  fetch: (input: string, init?: RequestInit) => Promise<Response>
}

/** The push key format `ginko_<site>_<32>` (same as the platform issues it). */
const PUSH_KEY_FORMAT = /^ginko_[a-z][a-z0-9-]{1,40}_[a-z0-9]{32}$/
/** Deadlines of one platform call, counting the reading of the body: GET 30 s, release POST 60 s. */
const READ_TIMEOUT_MS = 30_000
const WRITE_TIMEOUT_MS = 60_000
const UNKNOWN_OUTCOME = 'It is unknown whether the release arrived. The same commit can run again without risk.'

/** Plain http only for the machine itself; the push key must not travel unencrypted. */
function checkPlatformUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new CliError('GINKO_PLATFORM is not a valid URL.', 'USAGE')
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new CliError('GINKO_PLATFORM must start with https:// (http:// only for localhost, 127.0.0.1 and [::1]).', 'USAGE')
  }
}

export function createPlatform(options: PlatformOptions): Platform {
  checkPlatformUrl(options.url)
  const key = options.key.trim()
  // Checked before any request, and the value is never part of the message: it may be a real key with a typo.
  if (!PUSH_KEY_FORMAT.test(key)) throw new CliError('GINKO_KEY is not a valid push key (expected: ginko_<site>_<32 characters a-z0-9>).', 'USAGE')
  const base = options.url.replace(/\/+$/, '')

  // Messages here are fixed English text. Raw fetch errors are not passed on: they can quote header values.
  async function call(path: string, init: RequestInit = {}, deadlineMs = READ_TIMEOUT_MS, note = ''): Promise<unknown> {
    const signal = AbortSignal.timeout(deadlineMs)
    const after = note ? ` ${note}` : ''
    let response: Response
    try {
      response = await options.fetch(`${base}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${key}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
        // A redirect would re-send the key or the release body to another address.
        redirect: 'manual',
        signal,
      })
    } catch {
      throw new CliError(signal.aborted ? timeoutMessage(deadlineMs, note) : 'The platform is not reachable. Check GINKO_PLATFORM and your network.', 'UNAVAILABLE')
    }
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new CliError('The platform redirects; check GINKO_PLATFORM.', 'USAGE')
    }
    let text: string
    try {
      text = await response.text()
    } catch {
      throw new CliError(signal.aborted ? timeoutMessage(deadlineMs, note) : `The connection to the platform broke while reading the response.${after}`, 'UNAVAILABLE')
    }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      body = undefined
    }
    if (!response.ok) {
      const error = isObject(body) ? body : {}
      throw new PlatformError(
        typeof error.code === 'string' ? error.code : `HTTP_${response.status}`,
        typeof error.message === 'string' ? error.message.replaceAll(key, '…') : `The platform responded with HTTP ${response.status}.`,
        response.status,
        error.details,
      )
    }
    return body
  }

  function timeoutMessage(deadlineMs: number, note: string): string {
    return `The platform did not respond within ${deadlineMs / 1000} s.${note ? ` ${note}` : ''}`
  }

  return {
    async state(site) {
      return parseReleaseState(await call(`/release/state?site=${encodeURIComponent(site)}`))
    },
    async release(body) {
      const answer = await call('/release', { method: 'POST', body: JSON.stringify(body) }, WRITE_TIMEOUT_MS, UNKNOWN_OUTCOME)
      if (!isObject(answer) || typeof answer.schemaRev !== 'number' || typeof answer.contentRev !== 'number') {
        throw new CliError(`The platform did not send a valid response to the release. ${UNKNOWN_OUTCOME}`, 'UNAVAILABLE')
      }
      return { schemaRev: answer.schemaRev, contentRev: answer.contentRev }
    },
    async exportSite(site) {
      return parseExport(await call(`/export?site=${encodeURIComponent(site)}`), 'url', 'The platform did not return a valid export.')
    },
  }
}
