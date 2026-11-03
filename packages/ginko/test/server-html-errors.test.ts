// The middleware that makes cached addresses answer an error as HTML (runtime/server/html-errors.ts).
import { expect, test, vi } from 'vitest'

type Event = { url: URL; isr: unknown; req: Request; node?: { req: { headers: Record<string, string | undefined> } } }

vi.mock('nuxt/server', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getRequestURL: (event: Event) => event.url,
  getRequestHeader: (event: Event, name: string) => event.req.headers.get(name) ?? undefined,
  getRouteRules: (event: Event) => ({ isr: event.isr }),
}))

const { default: handler } = await import('../src/nuxt/runtime/server/html-errors.ts')
const isr = { expiration: 60, allowQuery: [] }
const curl = { 'user-agent': 'curl/8.7.1', accept: '*/*' }

/** The `Accept` header Nuxt's error handler sees after the middleware: Nuxt 4 reads the Node request, Nuxt 5 `event.req`. */
function accept(path: string, rules: unknown, headers: Record<string, string>, nuxt: 4 | 5) {
  const url = new URL(path, 'https://site.test')
  const event: Event = { url, isr: rules, req: new Request(url, { headers }) }
  if (nuxt === 4) event.node = { req: { headers: { ...headers } } }
  ;(handler as unknown as (event: Event) => void)(event)
  return nuxt === 4 ? event.node!.req.headers.accept : event.req.headers.get('accept')
}

// Wrong behaviour caught: a missing page first requested by curl or a monitor answers as JSON, and Vercel's ISR cache
// (it ignores Vary) serves that JSON to every browser afterwards instead of the site's 404 page.
test.each([4, 5] as const)('a cached page address asks for HTML whoever requests it (Nuxt %i)', (nuxt) => {
  expect(accept('/missing', isr, curl, nuxt)).toBe('text/html')
  expect(accept('/de/missing', 60, {}, nuxt)).toBe('text/html')
  expect(accept('/missing', isr, { accept: 'text/html,application/xhtml+xml' }, nuxt)).toBe('text/html,application/xhtml+xml')
})

// Wrong behaviour caught: the site's own API, Ginko's addresses or an uncached page lose Nuxt's JSON errors.
test.each([
  ['/api/contact', isr],
  ['/__ginko/files/de', { expiration: false, allowQuery: [] }],
  ['/__ginko', false],
  ['/feed.json', isr],
  ['/missing', false],
  ['/missing', undefined],
])('%s with isr %o keeps the request as it came', (path, rules) => {
  expect(accept(path, rules, curl, 4)).toBe('*/*')
  expect(accept(path, rules, curl, 5)).toBe('*/*')
})
