// HTTP routes of `ginko connect` (connect.ts): `POST /connect/start` opens a request, `POST /connect/poll` asks for its
// key. Both are public and take no key. Secrets (the device code, the key) travel only in bodies, never in a URL, a
// log line or an error message.
import { sha256 } from '@lupinum/ginko/internal'
import type { HttpRouter } from 'convex/server'
import { internal } from '../_generated/api'
import { httpAction } from '../_generated/server'
import { CONNECT, USER_CODE_ALPHABET } from '../connect'
import { failure, json } from './key'

/** Bodies are tiny; anything larger is not a connect call. */
const MAX_BODY = 1024
const DEVICE_CODE = /^[A-Za-z0-9_-]{43}$/
const NOT_VALID = 'This connect request is not valid. Start again with ginko connect.'

async function bodyOf(request: Request): Promise<Record<string, unknown> | undefined> {
  const raw = await request.text()
  if (raw.length > MAX_BODY) return undefined
  try {
    const body: unknown = JSON.parse(raw)
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** 8 symbols of the alphabet, each equally likely (bytes at or above the largest multiple of 31 are drawn again). */
function userCode(): string {
  const limit = 256 - (256 % USER_CODE_ALPHABET.length)
  let code = ''
  while (code.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit && code.length < 8) code += USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]
    }
  }
  return code
}

const start = httpAction(async (ctx, request) => {
  const body = await bodyOf(request)
  // Control characters would reach the Studio page and the Team page's key list.
  const label = typeof body?.label === 'string' ? body.label.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim() : ''
  if (label.length < 1 || label.length > CONNECT.labelMax) return failure('INVALID', `The label must have 1 to ${CONNECT.labelMax} characters.`)
  const siteUrl = process.env.SITE_URL?.replace(/\/+$/, '')
  if (!siteUrl) return failure('INTERNAL', 'The platform has no SITE_URL, so it cannot name the page that confirms the code.')
  const deviceCode = base64url(crypto.getRandomValues(new Uint8Array(32)))
  // A clash with a live code is rare (31⁸ codes, at most 200 live); a new code is drawn.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = userCode()
    const opened = await ctx.runMutation(internal.connect.open, { deviceHash: sha256(deviceCode), userCode: code, label })
    if (opened.ok) {
      return json(200, {
        deviceCode,
        userCode: `${code.slice(0, 4)}-${code.slice(4)}`,
        verifyUrl: `${siteUrl}/connect`,
        interval: CONNECT.intervalSeconds,
        expiresIn: Math.round(CONNECT.lifetimeMs / 1000),
      })
    }
    if (opened.reason === 'full') return json(429, { code: 'RATE_LIMITED', message: 'Too many connect requests are open. Try again in 10 minutes.' })
  }
  return failure('INTERNAL', 'Could not open a connect request. Try again.')
})

const poll = httpAction(async (ctx, request) => {
  const body = await bodyOf(request)
  const deviceCode = body?.deviceCode
  if (typeof deviceCode !== 'string' || !DEVICE_CODE.test(deviceCode)) return failure('INVALID', NOT_VALID)
  const answer = await ctx.runMutation(internal.connect.redeem, { deviceHash: sha256(deviceCode) })
  if (answer.state === 'pending') return json(200, { status: 'pending' })
  if (answer.state === 'invalid') return failure('INVALID', NOT_VALID)
  return json(200, { site: answer.site, key: answer.key })
})

export function register(http: HttpRouter) {
  http.route({ path: '/connect/start', method: 'POST', handler: start })
  http.route({ path: '/connect/poll', method: 'POST', handler: poll })
}
