// '#ginko/og' as the module writes it for a site without nuxt-og-image: nothing to call.
// A test calls `installOgImage` to stand in for a site that installs it (ES module bindings are live).
type Define = (component: string, props?: Record<string, unknown>) => unknown
export const ogTemplate = 'GinkoCard'
export let defineOgImage: Define | undefined
export function installOgImage(define: Define | undefined) { defineOgImage = define }
