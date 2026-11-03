// With the Nuxt SEO modules, @nuxtjs/robots writes robots.txt and the robots header, so Ginko's noindex reaches search
// engines only through nuxt-site-config's `indexable` (runtime/server/site-config.ts).
import { describe, expect, test, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ host: '', noindex: false }))
vi.mock('nuxt/server', () => ({
  getRequestHost: () => runtime.host,
  useRuntimeConfig: () => ({ public: { ginko: { url: 'https://www.example.at', noindex: runtime.noindex } } }),
}))

const { default: siteConfigPlugin } = await import('../src/nuxt/runtime/server/site-config.ts')

function pushedFor(host: string, noindex: boolean) {
  Object.assign(runtime, { host, noindex })
  const pushed: Record<string, unknown>[] = []
  let init: ((ctx: never) => void) | undefined
  siteConfigPlugin({ hooks: { hook: (_name, fn) => { init = fn as never } } })
  init!({ event: {}, siteConfig: { push: (input: Record<string, unknown>) => pushed.push(input) } } as never)
  return pushed.map((input) => input.indexable)
}

describe('site-config indexable', () => {
  // Wrong behaviour caught: a demo on its own address with NUXT_PUBLIC_GINKO_NOINDEX=true stays indexable, because
  // @nuxtjs/robots answers robots.txt and X-Robots-Tag with "index, follow".
  test.each([
    ['site host, noindex set', 'www.example.at', true, [false]],
    ['site host', 'www.example.at', false, []],
    ['preview host', 'site-git-x.vercel.app', false, [false]],
  ])('%s', (_name, host, noindex, expected) => {
    expect(pushedFor(host, noindex)).toEqual(expected)
  })
})
