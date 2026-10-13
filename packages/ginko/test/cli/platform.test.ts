import { afterEach, describe, expect, it, vi } from 'vitest'
import { CliError } from '../../src/cli/model.ts'
import { createPlatform, type ReleaseBody } from '../../src/cli/platform.ts'

const KEY = 'ginko_linde_k3y0secretpushkey0123456789abxyz'
const URL = 'https://platform.example'
const BODY = { site: 'linde', commit: 'abc', expectedSchemaRev: 1, expectedContentRev: 1, schema: {}, writes: [] } as unknown as ReleaseBody

type Fetch = (input: string, init?: RequestInit) => Promise<Response>
const never: Fetch = async () => { throw new Error('no request expected') }

/** Rejects with the error of the signal as soon as it fires, like a real fetch. */
const hangsUntilAborted: Fetch = (_url, init) => new Promise((_done, fail) => {
  init?.signal?.addEventListener('abort', () => fail(init.signal!.reason))
})

/** A 200 whose body fails after the first chunk (connection cut) or when the signal fires. */
const bodyCut: Fetch = async () => new Response(new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('{"schemaRev":'))
    setTimeout(() => controller.error(new TypeError('terminated')), 5)
  },
}))

const message = async (promise: Promise<unknown>) => {
  const error = await promise.then(() => undefined, (e: unknown) => e)
  expect(error).toBeInstanceOf(CliError)
  return (error as CliError).message
}

afterEach(() => vi.restoreAllMocks())

describe('push key and platform URL', () => {
  it.each([
    ['a newline inside', `${KEY.slice(0, 12)}\n${KEY.slice(12)}`],
    ['a space inside', `${KEY.slice(0, 10)} ${KEY.slice(10)}`],
    ['a wrong format', 'ginko_linde_short'],
  ])('a key with %s is refused before any request, and the message names GINKO_KEY, not its value', (_name, key) => {
    let error: unknown
    try {
      createPlatform({ url: URL, key, fetch: never })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(CliError)
    const text = (error as CliError).message
    expect(text).toContain('GINKO_KEY')
    for (const part of key.split(/\s/)) expect(text).not.toContain(part)
  })

  it('trims outer whitespace and sends the trimmed key as the bearer header', async () => {
    const seen: string[] = []
    const platform = createPlatform({
      url: URL,
      key: `${KEY}\n`,
      fetch: async (_url, init) => { seen.push(new Headers(init?.headers).get('authorization') ?? ''); return Response.json({ schemaRev: 1, contentRev: 1 }) },
    })
    await platform.release(BODY)
    expect(seen).toEqual([`Bearer ${KEY}`])
  })

  it.each([
    ['http://platform.example', false],
    ['http://192.168.1.20:4100', false],
    ['ftp://platform.example', false],
    ['not a url', false],
    ['https://platform.example', true],
    ['http://localhost:3211', true],
    ['http://127.0.0.1:3211', true],
    ['http://[::1]:3211', true],
  ])('GINKO_PLATFORM %s is %s', (url, allowed) => {
    const create = () => createPlatform({ url, key: KEY, fetch: never })
    if (allowed) expect(create).not.toThrow()
    else expect(create).toThrow(/GINKO_PLATFORM/)
  })

  it('an error of fetch that quotes the header is not passed on', async () => {
    const platform = createPlatform({ url: URL, key: KEY, fetch: async () => { throw new TypeError(`fetch failed: bad header Bearer ${KEY}`) } })
    const text = await message(platform.state('linde'))
    expect(text).toContain('not reachable')
    expect(text).not.toContain(KEY)
  })

  it('a platform message that quotes the key is cleaned', async () => {
    const platform = createPlatform({ url: URL, key: KEY, fetch: async () => Response.json({ code: 'X', message: `Schlüssel ${KEY} ungültig` }, { status: 401 }) })
    const error = await platform.state('linde').catch((e: unknown) => e)
    expect((error as Error).message).not.toContain(KEY)
  })
})

// Wrong behaviour caught: a bad answer exits 1 ("fix the code"), or the platform's own 404 loses its code.
describe('answers that are not a valid platform answer', () => {
  it.each([
    ['a state that is incomplete', 'UNAVAILABLE', () => Response.json({ site: 'linde' })],
    ['the platform\'s own 404', 'SITE_NOT_FOUND', () => Response.json({ code: 'SITE_NOT_FOUND', message: 'This site does not exist.' }, { status: 404 })],
  ])('%s ends state() with error.code %s', async (_name, code, response) => {
    const platform = createPlatform({ url: URL, key: KEY, fetch: async () => response() })
    await expect(platform.state('linde')).rejects.toMatchObject({ code })
  })
})

describe('redirects', () => {
  it('a 307 is refused with a German message and the body is not followed', async () => {
    const init: RequestInit[] = []
    const platform = createPlatform({
      url: URL,
      key: KEY,
      fetch: async (_url, i) => { init.push(i ?? {}); return new Response(null, { status: 307, headers: { location: 'https://other.example/release' } }) },
    })
    expect(await message(platform.release(BODY))).toBe('The platform redirects; check GINKO_PLATFORM.')
    expect(init).toHaveLength(1)
    expect(init[0]!.redirect).toBe('manual')
  })
})

describe('deadlines', () => {
  const shortened = () => {
    const original = AbortSignal.timeout.bind(AbortSignal)
    const asked: number[] = []
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => { asked.push(ms); return original(20) })
    return asked
  }

  it('a GET gets 30 s and a silent platform ends with a German message', async () => {
    const asked = shortened()
    const text = await message(createPlatform({ url: URL, key: KEY, fetch: hangsUntilAborted }).state('linde'))
    expect(asked).toEqual([30_000])
    expect(text).toContain('30 s')
    expect(text).not.toContain('unknown')
  })

  it('the release POST gets 60 s; a timeout says that the outcome is unknown and that a rerun is safe', async () => {
    const asked = shortened()
    const text = await message(createPlatform({ url: URL, key: KEY, fetch: hangsUntilAborted }).release(BODY))
    expect(asked).toEqual([60_000])
    expect(text).toContain('60 s')
    expect(text).toContain('unknown')
    expect(text).toContain('without risk')
  })

  it('the deadline counts the reading of the body', async () => {
    shortened()
    const slowBody: Fetch = async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(init.signal!.reason))
      },
    }))
    const text = await message(createPlatform({ url: URL, key: KEY, fetch: slowBody }).state('linde'))
    expect(text).toContain('30 s')
  })
})

describe('a connection cut while the body is read', () => {
  it('the release POST says that the outcome is unknown, not just "terminated"', async () => {
    const text = await message(createPlatform({ url: URL, key: KEY, fetch: bodyCut }).release(BODY))
    expect(text).toContain('connection')
    expect(text).toContain('unknown')
    expect(text).not.toContain('terminated')
  })

  it('a GET says the same without the release hint', async () => {
    const text = await message(createPlatform({ url: URL, key: KEY, fetch: bodyCut }).state('linde'))
    expect(text).toContain('connection')
    expect(text).not.toContain('unknown')
  })
})
