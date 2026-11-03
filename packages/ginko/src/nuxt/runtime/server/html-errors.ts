// Error pages on cached addresses. Nuxt answers an error (a missing page: 404) as JSON when the request does not ask
// for HTML (curl, uptime monitors, some bots). Vercel's ISR cache ignores `Vary` and keeps that first answer, so every
// later visitor of the address got JSON instead of the site's 404 page (ginko-i18n DECISIONS.md D10). A cached address
// therefore always asks for HTML. Addresses that answer JSON by their path (`/api/`, `.json`) and Ginko's own
// (`/__ginko/`) keep Nuxt's choice.
import { defineEventHandler, getRequestHeader, getRequestURL, getRouteRules } from 'nuxt/server'

/** The h3 v1 event of Nuxt 4: its error handler reads the headers of the Node request, not `event.req`. */
type NodeEvent = { node?: { req: { headers: Record<string, string | string[] | undefined> } } }

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  // `isr` is Nitro's rule: Nuxt's type knows it only where Nitro's types are loaded.
  const rules = getRouteRules(event)
  if (!('isr' in rules && rules.isr) || /^\/(api|__ginko)(\/|$)/.test(path) || path.endsWith('.json')) return
  if (getRequestHeader(event, 'accept')?.includes('text/html')) return
  const node = (event as NodeEvent).node
  if (node) node.req.headers.accept = 'text/html'
  else event.req.headers.set('accept', 'text/html')
})
