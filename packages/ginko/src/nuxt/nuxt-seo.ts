// The Nuxt SEO modules (https://nuxtseo.com). Ginko's own SEO output is the default. When a site uses one of these
// modules, directly, through @nuxtjs/seo (which installs all of them) or through another module, Ginko leaves that
// output to the module and hands it the site's data (internals/decisions.md D4).
import { hasNuxtModule } from '@nuxt/kit'
import type { ModuleDependencies, Nuxt } from 'nuxt/schema'
import type { SiteInput } from '../core/index.ts'

/** Each module's options key in nuxt.config: `false` there, or `enabled: false` inside it, turns the module off. */
const configKeys = {
  'nuxt-site-config': 'site',
  '@nuxtjs/sitemap': 'sitemap',
  '@nuxtjs/robots': 'robots',
  'nuxt-og-image': 'ogImage',
  'nuxt-schema-org': 'schemaOrg',
  'nuxt-seo-utils': 'seo',
  'nuxt-ai-ready': 'aiReady',
  '@nuxtjs/seo': 'nuxtseo',
} as const

export type NuxtSeoModule = keyof typeof configKeys

/** The site's own options of a module; they are typed only where the module is installed, so they are read as unknown. */
function optionsOf(name: NuxtSeoModule, nuxt: Nuxt): unknown {
  return (nuxt.options as unknown as Record<string, unknown>)[configKeys[name]]
}

function turnedOff(name: NuxtSeoModule, nuxt: Nuxt): boolean {
  const options = optionsOf(name, nuxt)
  return options === false || (typeof options === 'object' && options !== null && 'enabled' in options && options.enabled === false)
}

/**
 * Whether a Nuxt SEO module runs, once every module is installed (`modules:done`). It sees modules that another
 * module installs as its dependency, such as @nuxtjs/sitemap through nuxt-ai-ready.
 */
export function runsNuxtSeo(name: NuxtSeoModule, nuxt: Nuxt): boolean {
  return !turnedOff(name, nuxt) && nuxt.options._installedModules.some((m) => m.meta?.name === name && !m.meta.disabled)
}

/**
 * The same during Ginko's own setup, for what must be decided before `modules:done` (the share card's component).
 * It sees the modules listed in nuxt.config, in any order, and the ones @nuxtjs/seo installs.
 */
export async function listsNuxtSeo(name: NuxtSeoModule, nuxt: Nuxt): Promise<boolean> {
  if (turnedOff(name, nuxt)) return false
  return (await hasNuxtModule(name, nuxt)) || (!turnedOff('@nuxtjs/seo', nuxt) && (await hasNuxtModule('@nuxtjs/seo', nuxt)))
}

/**
 * What Ginko hands the Nuxt SEO modules, as Nuxt module dependencies: `optional` installs nothing, and `defaults`
 * fill only what the site's own nuxt.config leaves unset, whatever the order of `modules`. A module the site turned
 * off gets nothing (defaults would turn it back on), and a list the site set itself is not extended.
 */
export function nuxtSeoDependencies(site: SiteInput | undefined, nuxt: Nuxt): ModuleDependencies {
  // A missing `ginko` option fails in setup with its own message.
  if (!site?.url) return {}
  const main = site.locales[0]
  const organization = site.seo?.organization
  const own = (name: NuxtSeoModule, key: string) => {
    const options = optionsOf(name, nuxt)
    return typeof options === 'object' && options !== null && key in options
  }
  const dependencies: Partial<Record<NuxtSeoModule, ModuleDependencies[string]>> = {
    // Every Nuxt SEO module reads the site's address, name and language from here (per request: runtime/server/site-config.ts).
    'nuxt-site-config': { optional: true, defaults: { url: site.url, name: site.name, description: site.seo?.description, defaultLocale: site.languages?.[main] ?? main } },
    // Ginko's URLs with lastmod, images and hreflang. Page discovery would list folders that are no pages, and the
    // module's own hreflang pairs locales by prefix, which is wrong for translated slugs.
    '@nuxtjs/sitemap': { optional: true, defaults: { sources: ['/__ginko/sitemap.json'], autoI18n: false, ...(!own('@nuxtjs/sitemap', 'excludeAppSources') && { excludeAppSources: ['nuxt:pages'] }) } },
    // Ginko's own /sitemap.xml when @nuxtjs/sitemap is not installed; robots.txt lists each sitemap once.
    '@nuxtjs/robots': own('@nuxtjs/robots', 'sitemap') ? { optional: true } : { optional: true, defaults: { sitemap: ['/sitemap.xml'] } },
    // The API of Ginko's share cards (runtime/og).
    'nuxt-og-image': { optional: true, version: '>=7.0.0' },
  }
  // The organization is the site's identity: nuxt-schema-org links every page's JSON-LD to it.
  if (organization) {
    const logo = organization.logo && new URL(organization.logo, site.url).href
    dependencies['nuxt-schema-org'] = { optional: true, defaults: { identity: { type: 'Organization', name: site.name, url: site.url, logo, sameAs: organization.sameAs } } }
  }
  // Ginko serves /llms.txt and a `.md` twin of every page; nuxt-ai-ready serves its own at the same addresses, and its
  // prerender step cannot read Ginko's. `agents: { enabled: false }` in ginko.config leaves them to nuxt-ai-ready.
  if (site.agents?.enabled !== false) dependencies['nuxt-ai-ready'] = { optional: true, defaults: { enabled: false } }
  return Object.fromEntries(Object.entries(dependencies).filter(([name]) => optionsOf(name as NuxtSeoModule, nuxt) !== false)) as ModuleDependencies
}
