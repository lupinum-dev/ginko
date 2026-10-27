import { expect, test } from 'vitest'
import { platformBuildCheck } from '../src/nuxt/platform-check.ts'

// Wrong behaviour caught: a Vercel production build without the platform address succeeds and ships a site that answers
// 503 (the variable was set for Preview only); or a file-only site, a preview or a non-Vercel build is blocked by mistake.
test.each([
  { name: 'Vercel production without platform fails', needsPlatform: true, platform: '', vercelEnv: 'production', error: true, warns: 1 },
  { name: 'non-Vercel build without platform only warns', needsPlatform: true, platform: undefined, vercelEnv: undefined, error: false, warns: 1 },
  { name: 'Vercel preview without platform only warns', needsPlatform: true, platform: '', vercelEnv: 'preview', error: false, warns: 2 },
  { name: 'production with platform and token is ok', needsPlatform: true, platform: 'https://platform.test', token: 'x', vercelEnv: 'production', error: false, warns: 0 },
  { name: 'production with platform, no token warns once', needsPlatform: true, platform: 'https://platform.test', vercelEnv: 'production', error: false, warns: 1 },
  { name: 'file-only site needs nothing', needsPlatform: false, platform: '', vercelEnv: 'production', error: false, warns: 0 },
])('$name', ({ error, warns, ...input }) => {
  const result = platformBuildCheck({ token: undefined, ...input })
  expect(Boolean(result.error)).toBe(error)
  expect(result.warnings).toHaveLength(warns)
  if (result.error) expect(result.error).toContain('NUXT_PUBLIC_GINKO_PLATFORM')
  if (result.error) expect(result.error).toContain('Production and Preview')
})
