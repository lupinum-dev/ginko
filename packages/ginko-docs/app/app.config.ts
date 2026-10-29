// The site sets its docs options in its own app.config.ts; every option is optional:
//   export default defineAppConfig({ docs: { title: 'Ginko', logo: { light: '/logo.svg' }, social: [...] } })
// Texts are not configured here but in the site's i18n messages (see the README).
import type { DocsAssistant } from './lib/docsPage'

export default defineAppConfig({ docs: {} })

export interface DocsConfig {
  /** Brand name in the header; the accessible name of the logo. Default: `name` from ginko.config.ts. */
  title?: string
  /** A logo before the title, or instead of it with `wordmark: true` (the image then carries the name).
   *  `dark` is shown in dark mode (else `light` always). */
  logo?: { light: string, dark?: string, wordmark?: boolean }
  /** Colour preset: `default` (emerald on zinc) or `green` (green on slate). A site's own shadcn tokens win over either. */
  theme?: 'default' | 'green'
  /** More header links after Docs, Blog and Changelog. Texts: messages `docs.nav.<id>`. */
  nav?: { id: string, href: string }[]
  /** Icon links at the end of the header, e.g. `{ icon: 'docs:github', href, label: 'GitHub' }`. Built in:
   *  `docs:github`, `docs:discord`, `docs:x`, `docs:bluesky`, `docs:mastodon`, `docs:linkedin`, `docs:youtube`. */
  social?: { icon: string, href: string, label: string }[]
  /** Dismissible banner above the header. Text: message `docs.banner.<id>`. A new id shows it again to everyone. */
  banner?: { id: string, href?: string }
  /** Git host of the docs: "Edit this page" for pages from files, "Report an issue" for GitHub repositories. */
  repository?: {
    url: string
    /** Default `main`. */
    branch?: string
    /** Edit link template; `{url}`, `{branch}` and `{source}` are replaced. Default `{url}/edit/{branch}/{source}`. */
    editUrl?: string
    /** Issue link template; `{url}`, `{title}` and `{page}` are replaced. Default on GitHub: a new issue with the page title. */
    issueUrl?: string
  }
  /** `true` adds "Edit this page" to pages stored on the Ginko platform, linking to their form in the Studio (at the
   *  site's platform address). Default false: visitors of a public site see no link to the Studio. */
  studioEditLink?: boolean
  /** "Copy page" (default true) and the chats the page menu can open it in (default both, `[]` for none). */
  markdownActions?: { copy?: boolean, openIn?: DocsAssistant[] }
  /** `false` leaves out the built-in search (header, sidebar, phone bar), for a site with <DocsSearch /> in its own header. */
  search?: boolean
  /** Footer. Link texts: messages `docs.footer.<id>`. `attribution` (default true) adds "Built with Ginko". */
  footer?: { links?: { id: string, href: string }[], attribution?: boolean }
}

declare module '@nuxt/schema' {
  interface AppConfigInput { docs?: DocsConfig }
  interface AppConfig { docs: DocsConfig }
}
