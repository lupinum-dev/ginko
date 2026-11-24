// `ginko connect` (src/cli/connect.ts) against a fake platform: the network, `gh`, the browser and the terminal question
// are replaced. The server side of the flow is tested in packages/ginko-server/test/connect.test.ts.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ConnectIO } from '../../src/cli/connect.ts'
import { storeQuestion } from '../../src/cli/connect.ts'
import { main } from '../../src/cli/index.ts'

const STUDIO = 'https://cms.example.com'
const BACKEND = 'https://happy-otter-123.convex.site'
const DEVICE = 'D'.repeat(43)
const KEY = 'ginko_linde_abcdefghijkmnpqrstuvwxyz23456789ab'
const RESTAURANT_CONFIG = fileURLToPath(new URL('../../../../sites/restaurant/ginko.config.ts', import.meta.url))

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

interface Fake {
  /** Answers of /connect/poll in order; the last one repeats. */
  polls?: Response[]
  /** `gh` per subcommand: exit code, or 'missing' when gh is not installed. */
  gh?: Partial<Record<'repo' | 'secret' | 'variable', number>> | 'missing'
  /** What `gh repo view --json nameWithOwner` prints. */
  repoView?: string
  answer?: string
  site?: string
  /** The confirmation page the platform names. */
  verifyUrl?: string
}

async function run(argv: string[], fake: Fake = {}) {
  const requests: { url: string; body?: string }[] = []
  const ghCalls: { args: string[]; input?: string }[] = []
  const opened: string[] = []
  const asked: string[] = []
  const out: string[] = []
  const log: string[] = []
  const polls = fake.polls ?? [json(200, { status: 'pending' }), json(200, { site: fake.site ?? 'linde', key: KEY })]
  let poll = 0
  const io: ConnectIO = {
    open: (url) => { opened.push(url) },
    async run(command, args, input) {
      expect(command).toBe('gh')
      ghCalls.push({ args, input })
      if (fake.gh === 'missing') throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' })
      return { code: fake.gh?.[args[0] as 'repo' | 'secret' | 'variable'] ?? 0, stdout: args[0] === 'repo' ? fake.repoView ?? '{"nameWithOwner":"anna/linde-website"}' : '' }
    },
    ask: async (question) => { asked.push(question); return fake.answer },
    sleep: async () => {},
    cwd: () => '/home/anna/projects/linde-website',
  }
  const code = await main(argv, {
    env: {},
    git: async () => '',
    stdout: (text) => out.push(text),
    log: (line) => log.push(line),
    async fetch(url, init) {
      requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined })
      if (url === `${STUDIO}/.well-known/ginko-platform`) return json(200, { backend: BACKEND, version: '0.9.0' })
      if (url === `${BACKEND}/connect/start`) return json(200, { deviceCode: DEVICE, userCode: 'ABCD-EFGH', verifyUrl: fake.verifyUrl ?? `${STUDIO}/connect`, interval: 2, expiresIn: 600 })
      if (url === `${BACKEND}/connect/poll`) return polls[Math.min(poll++, polls.length - 1)]!.clone()
      throw new Error(`unexpected request ${url}`)
    },
  }, io)
  return { code, stdout: out.join(''), log, requests, ghCalls, opened, asked }
}

describe('ginko connect', () => {
  // Wrong behaviour caught: the key lands in the JSON line (CI logs keep it), in a command line (other processes see
  // it), or the device code travels in a URL; or the person is not told where to confirm.
  it('shows the page and the code, polls until confirmed, and stores the key with gh over stdin after a yes', async () => {
    const result = await run(['connect', STUDIO, '--config', RESTAURANT_CONFIG], { answer: 'y', site: 'restaurant' })
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('{"ok":true,"site":"restaurant","stored":"github"}\n')
    expect(result.log[0]).toBe(`Open ${STUDIO}/connect and enter this code: ABCD-EFGH`)
    expect(result.opened).toEqual([`${STUDIO}/connect`])
    expect(JSON.parse(result.requests[1]!.body!)).toEqual({ label: 'linde-website' })
    expect(result.requests.filter((r) => r.url.endsWith('/connect/poll')).map((r) => r.body)).toEqual([JSON.stringify({ deviceCode: DEVICE }), JSON.stringify({ deviceCode: DEVICE })])
    expect(result.requests.map((r) => r.url).join(' ')).not.toContain(DEVICE)
    expect(result.asked).toEqual(['Store the key as the secret GINKO_KEY and the address as the variable GINKO_PLATFORM of the GitHub repository anna/linde-website? Existing values are replaced. (y/n) '])
    expect(result.asked).toEqual([storeQuestion('anna/linde-website')])
    expect(result.ghCalls).toEqual([
      { args: ['repo', 'view', '--json', 'nameWithOwner'], input: undefined },
      { args: ['secret', 'set', 'GINKO_KEY'], input: KEY },
      { args: ['variable', 'set', 'GINKO_PLATFORM', '--body', STUDIO], input: undefined },
    ])
    expect([result.stdout, ...result.log].join('\n')).not.toContain(KEY)
    // The config names the connected site: no line to set.
    expect(result.log.join('\n')).not.toContain("site: '")
  })

  // Wrong behaviour caught: without gh, outside a GitHub repository, without a terminal or after a no, the key is lost
  // (never shown) or shown more than once.
  it.each([
    ['gh is not installed', { gh: 'missing' as const }],
    ['the folder is no GitHub repository', { gh: { repo: 1 } }],
    ['gh names no readable repository', { answer: 'y', repoView: 'not json' }],
    ['there is no terminal to ask', { answer: undefined }],
    ['the answer is no', { answer: 'n' }],
    ['gh fails to store the secret', { answer: 'yes', gh: { secret: 1 } }],
  ])('shows the key once on stderr when %s', async (_case, fake: Fake) => {
    const result = await run(['connect', `${STUDIO}/`], fake)
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('{"ok":true,"site":"linde","stored":"shown"}\n')
    expect(result.log.filter((line) => line.includes(KEY))).toEqual([KEY])
    expect(result.log).toContain('This is the publishing key. It is shown only now; store it as the secret GINKO_KEY of your CI:')
    expect(result.ghCalls.some((c) => c.args[0] === 'variable')).toBe(false)
  })

  // Wrong behaviour caught: an address from someone else's platform makes the opener run a local file or an app
  // (`file:`), carries a user name and password the person never typed, or is cut at `&` by a shell, which on Windows
  // would run the rest as a second command.
  it.each([
    ['a file: address', 'file:///Applications/Calculator.app'],
    ['an address with a user name and password', 'https://user:pass@cms.example.com/connect'],
    ['plain http to another machine', 'http://cms.example.com/connect'],
    ['no address', 'connect'],
  ])('refuses %s as the confirmation page and opens nothing', async (_case, verifyUrl) => {
    const result = await run(['connect', STUDIO], { verifyUrl })
    expect(result.code).toBe(3)
    expect(result.opened).toEqual([])
    expect(result.log.some((line) => line.startsWith('Open '))).toBe(false)
    expect(JSON.parse(result.stdout).error.code).toBe('INVALID_ANSWER')
    expect(result.requests.some((r) => r.url.endsWith('/connect/poll'))).toBe(false)
  })

  it('passes an address with & in its query to the opener as one argument (a shell would run the part after & as a command)', async () => {
    const result = await run(['connect', STUDIO], { verifyUrl: `${STUDIO}/connect?a=1&calc.exe`, answer: 'n' })
    expect(result.opened).toEqual([`${STUDIO}/connect?a=1&calc.exe`])
  })

  // Wrong behaviour caught: the command edits ginko.config.ts, or stays silent when the folder names another site.
  it('prints the line to set when ginko.config.ts names another site, and writes nothing', async () => {
    const result = await run(['connect', STUDIO, '--config', RESTAURANT_CONFIG], { answer: 'n' })
    expect(result.log).toContain("Set this in ginko.config.ts: site: 'linde',")
  })

  // Wrong behaviour caught: a declined request keeps the command waiting for 10 minutes, or a short outage of the
  // backend ends it although the person is about to confirm.
  it('tries again after a 5xx answer and ends with exit 1 when the request was declined', async () => {
    const result = await run(['connect', STUDIO], { polls: [json(503, {}), json(200, { status: 'pending' }), json(400, { code: 'INVALID', message: 'This connect request is not valid. Start again with ginko connect.' })] })
    expect(result.code).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, error: { code: 'INVALID', message: 'The request was declined or is no longer valid. Start again with ginko connect.' } })
    expect(result.requests.filter((r) => r.url.endsWith('/connect/poll'))).toHaveLength(3)
  })

  // Wrong behaviour caught: a typo sends the request over plain http to another machine, or the command starts without
  // an address.
  it.each([
    [['connect']],
    [['connect', 'http://cms.example.com']],
  ])('refuses %j with exit 2 before any request', async (argv) => {
    const result = await run(argv)
    expect(result.code).toBe(2)
    expect(result.requests).toEqual([])
  })
})
