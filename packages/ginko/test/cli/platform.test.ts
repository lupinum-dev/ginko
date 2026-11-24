import { afterEach, describe, expect, it, vi } from 'vitest'
import { CliError } from '../../src/cli/model.ts'
import { createPlatform, DISCOVERY_PATH, versionNote, type ReleaseBody } from '../../src/cli/platform.ts'
import { connectPlatform, type CliDeps } from '../../src/cli/run.ts'

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

describe('GINKO_PLATFORM as the Studio address (discovery document)', () => {
  const STATE = { schemaRev: 1, contentRev: 1, entries: [] }
  /** The requests a run makes: address and whether the push key went along. */
  function connect(answers: Record<string, () => Response | Promise<Response>>) {
    const requests: { url: string; key: boolean }[] = []
    const fetch: Fetch = async (url, init) => {
      requests.push({ url, key: JSON.stringify(init?.headers ?? {}).includes(KEY) })
      const answer = answers[url]
      return answer ? answer() : Response.json({ code: 'SITE_NOT_FOUND', message: 'x' }, { status: 404 })
    }
    const deps = { env: { GINKO_PLATFORM: URL, GINKO_KEY: KEY }, fetch } as unknown as CliDeps
    return { platform: connectPlatform(deps), requests }
  }

  // Wrong behaviour caught: the CLI sends the release to the Studio, which answers with its login page (Gap 11), or
  // sends the push key to a public document.
  it('the document names the backend: the calls go there, once resolved, and the key never goes to the document', async () => {
    const { platform, requests } = connect({
      [`${URL}${DISCOVERY_PATH}`]: () => Response.json({ backend: 'https://happy-cat-123.convex.site/', version: '0.18.0' }),
      'https://happy-cat-123.convex.site/release/state?site=linde': () => Response.json(STATE),
    })
    await platform.state('linde').catch(() => undefined)
    await platform.state('linde').catch(() => undefined)
    expect(requests).toEqual([
      { url: `${URL}${DISCOVERY_PATH}`, key: false },
      { url: 'https://happy-cat-123.convex.site/release/state?site=linde', key: true },
      { url: 'https://happy-cat-123.convex.site/release/state?site=linde', key: true },
    ])
    expect(await platform.discovery()).toEqual({ backend: 'https://happy-cat-123.convex.site', version: '0.18.0' })
  })

  // Wrong behaviour caught: sites that give the `.convex.site` address (all sites before this change) stop working.
  it.each([
    ['a 404', () => new Response('Not found', { status: 404 })],
    ['a redirect to the login page', () => new Response(null, { status: 302, headers: { location: '/login' } })],
    ['an HTML page', () => new Response('<html></html>', { status: 200 })],
    ['a network failure', () => { throw new TypeError('fetch failed') }],
  ])('without a document (%s) the address is the backend', async (_name, answer) => {
    const { platform, requests } = connect({ [`${URL}${DISCOVERY_PATH}`]: answer })
    await platform.state('linde').catch(() => undefined)
    expect(requests.map((request) => request.url)).toEqual([`${URL}${DISCOVERY_PATH}`, `${URL}/release/state?site=linde`])
    expect(await platform.discovery()).toEqual({ backend: URL })
  })

  // Wrong behaviour caught: a document that points the push key at a plain-http address.
  it('a document with a backend that is not https stops before the key is sent', async () => {
    const { platform, requests } = connect({ [`${URL}${DISCOVERY_PATH}`]: () => Response.json({ backend: 'http://evil.example' }) })
    expect(await message(platform.state('linde'))).toContain('not https://')
    expect(requests.filter((request) => request.key)).toEqual([])
  })
})

describe('version note', () => {
  // Wrong behaviour caught: a site on a newer Ginko than its platform gets a bare rejection without the reason, or a
  // platform of unknown version (an older Studio, a monorepo build) produces a false warning.
  it.each([
    ['an older minor', '0.17.4', '0.18.0', 'This platform runs Ginko 0.17.4; the site uses 0.18.0. Update the platform first if the release is rejected.'],
    ['an older major', '1.9.0', '2.0.0', 'This platform runs Ginko 1.9.0; the site uses 2.0.0. Update the platform first if the release is rejected.'],
    ['the same minor with an older patch', '0.18.0', '0.18.3', undefined],
    ['a newer platform', '0.19.0', '0.18.3', undefined],
    ['an unknown platform version', undefined, '0.18.0', undefined],
    ['a monorepo platform (0.0.0)', '0.0.0', '0.18.0', undefined],
    ['a monorepo site (0.0.0)', '0.17.0', '0.0.0', undefined],
  ])('%s', (_name, platform, site, note) => {
    expect(versionNote(platform, site)).toBe(note)
  })
})
