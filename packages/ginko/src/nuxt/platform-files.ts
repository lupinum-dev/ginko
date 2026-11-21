// The platform's images as files of the build: every file address the published content names is prerendered, so
// after a deploy no image needs the function (docs: 11.deploy "Vercel"). Images added later go through the
// function once and are then cached by the `/__ginko/file/**` route rule (route-rules.ts).
import type { Locale } from '../core/index.ts'
import { bundleRequest, FILE_ID } from './runtime/platform-request.ts'

const PREFIX = '/__ginko/file/'

/** A string that is a whole file address (`/__ginko/file/<upload>/<storage>`), as the platform writes it with `files=stable`. */
function isFileAddress(value: string): boolean {
  if (!value.startsWith(PREFIX)) return false
  const parts = value.slice(PREFIX.length).split('/')
  return parts.length === 2 && parts.every((part) => FILE_ID.test(part))
}

/**
 * The file addresses in the platform's bundles, each once. Only a string value that is a whole address counts (an
 * image field's `url`, a variant, an image in a Markdown tree); a text that mentions one is no image.
 */
export function fileAddresses(bundles: readonly unknown[]): string[] {
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (isFileAddress(value)) found.add(value)
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item)
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) walk(item)
    }
  }
  for (const bundle of bundles) walk(bundle)
  return [...found]
}

const EFFECT = 'Images are served through the function as before.'

/**
 * The file addresses to prerender: the bundle of every locale, read from the platform as the pages read it. Never
 * throws: without the platform address or an answer the build goes on with no routes and one warning.
 */
export async function platformFileRoutes(input: { platform: string | undefined; site: string; locales: readonly Locale[]; siteToken?: string }): Promise<{ routes: string[]; warning?: string }> {
  if (!input.platform) return { routes: [], warning: `[ginko] Images are not part of the build: the platform address is not set. ${EFFECT}` }
  try {
    const bundles = await Promise.all(input.locales.map(async (locale) => {
      const { url, init } = bundleRequest(input.platform!, input.site, locale, undefined, input.siteToken)
      const response = await fetch(url, init)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return (await response.json()) as unknown
    }))
    return { routes: fileAddresses(bundles) }
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    return { routes: [], warning: `[ginko] Images are not part of the build: the platform did not answer the bundle request (${cause}). ${EFFECT}` }
  }
}
