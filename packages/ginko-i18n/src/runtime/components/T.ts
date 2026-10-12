import { defineComponent, Fragment, h, type PropType, type VNodeChild } from 'vue'
import { partsToString, type Params, type Part } from '@lupinum/ginko-i18n/core'
import { useI18n } from '../composables'
import type { TKey } from '../types'

/**
 * Renders a message with tags. `<link>Text</link>` calls the `#link` slot with `{ text }`.
 * `k` is a full key, typed from the app's messages (a missing key fails vue-tsc); library keys include their namespace.
 */
export default defineComponent({
  name: 'T',
  props: {
    k: { type: String as PropType<TKey>, required: true },
    params: { type: Object as PropType<Params>, default: undefined },
  },
  setup(props, { slots }) {
    const { parts } = useI18n()
    // Params are checked per key at `t()` call sites; a template prop cannot tie them to `k`.
    const partsOf = parts as (key: string, params?: Params) => Part[]
    const render = (list: Part[]): VNodeChild[] => list.map((part) => {
      if (typeof part === 'string') return part
      const slot = slots[part.tag]
      return slot ? slot({ text: partsToString(part.children) }) : render(part.children)
    })
    return () => h(Fragment, render(partsOf(props.k, props.params)))
  },
})
