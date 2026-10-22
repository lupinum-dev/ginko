/// <reference path="./schema.d.ts" />
// Renders a `markdown` field (CONTENT.md): the Comark tree parsed at build time, so no parser or
// highlighter runs here. In page state the field is `{ ref }`: the tree is loaded from the site,
// so the payload holds only the texts a page shows. Registered by the Ginko module in every site.
import { computed, defineComponent, h, inject, provide, type Component, type ComputedRef, type PropType } from 'vue'
import components from '#ginko/components'
import { GINKO_COMPONENTS_KEY, GINKO_TOC_KEY } from '../../internal.ts'
import { GinkoMarkdown as GinkoMarkdownTree } from '../../vue.ts'
import type { MarkdownTree, MarkdownValue } from '../../internal.ts'
import { useGinkoMarkdown } from './markdown.ts'
import { GinkoFact } from './GinkoFact.ts'

export const GinkoMarkdown = defineComponent({
  name: 'GinkoMarkdown',
  props: {
    value: { type: Object as PropType<MarkdownValue | undefined>, default: undefined },
    /**
     * Tag → component (or another tag name), e.g. `{ callout: Callout }`. It is merged over the map the app
     * provides under `ginko:components` (e.g. by `@lupinum/ginko-components`), so a tag given here wins.
     * Other tags use a global component of that name (PascalCase), else a plain element. `fact` (facts in
     * ginko.config) renders with GinkoFact unless one of the maps names its own component.
     */
    components: { type: Object as PropType<Record<string, Component | string>>, default: () => ({}) },
    /** Puts `idPrefix-` before every id and `#` link of this body, for a page that shows several bodies (a changelog). */
    idPrefix: { type: String, default: '' },
  },
  async setup(props) {
    const provided = inject<Record<string, Component | string>>(GINKO_COMPONENTS_KEY, {})
    // Reactive: a page that shows another entry (client navigation) loads that entry's text.
    // Provided before the await (inject/provide need the instance); read at render, after `tree` is set.
    let tree: ComputedRef<MarkdownTree | null> | undefined
    provide(GINKO_TOC_KEY, computed(() => tree?.value?.toc ?? null))
    tree = await useGinkoMarkdown(() => props.value)
    // The site's registry: a component keeps the props it declares there (attributeProblem).
    return () => h(GinkoMarkdownTree, { value: tree!.value, components: { fact: GinkoFact, ...provided, ...props.components }, registry: components, idPrefix: props.idPrefix })
  },
})
