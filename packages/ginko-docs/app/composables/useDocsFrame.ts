import type { InjectionKey } from 'vue'

// Whether the docs render in the layer's own frame (layouts/default.vue) or inside a site's layout. Standalone, the
// header holds the search and, on phones, the navigation; embedded, DocsShell brings both itself.
const STANDALONE: InjectionKey<boolean> = Symbol('docs-standalone')

/** Called by the layer's own layout. */
export const provideDocsStandalone = () => provide(STANDALONE, true)

/** True inside the layer's own frame, false when a site's layout holds the docs. */
export const useDocsStandalone = () => inject(STANDALONE, false)
