// The components of `@lupinum/ginko-components` that the editor draws as the real Vue component (see
// `componentMode` in @lupinum/ginko-editor for the rule). Their stylesheet is imported here and nowhere else, so
// they load together with the editor: every class is prefixed `ginko-` and the colours are the shadcn tokens of
// the Studio (light and dark), so nothing outside the editor changes.
import { componentMap } from '@lupinum/ginko-components/components'
import type { Component } from 'vue'
import '@lupinum/ginko-components/styles.css'

/** Tags drawn live. A tag listed here is still a card when the registry says so (named slots, children, parents). */
export const LIVE_TAGS = [
  'callout', 'note', 'info', 'warning', 'error', 'success', 'idea',
  'aside', 'excerpt', 'dropcap', 'flow', 'center', 'collapse', 'card', 'read-more',
] as const

export const LIVE_COMPONENTS: Record<string, Component> = Object.fromEntries(LIVE_TAGS.map((tag) => [tag, componentMap[tag]!]))

/** Props that change how a live component behaves in the editor (they are shown, but the block must stay usable). */
export const EDITOR_PROPS: Record<string, Record<string, unknown>> = {
  // A closed `<details>` hides the editable text.
  collapse: { open: true },
}
