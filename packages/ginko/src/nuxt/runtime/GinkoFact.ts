// The default renderer of `:fact{name="…"}` in Markdown fields (facts in ginko.config): the value as text, an email
// address or phone number as a link. A site maps `fact` to its own component (GinkoMarkdown `components`) to change it.
import { defineComponent, h } from 'vue'
import schema from '#ginko/schema'
import { useGinkoFact } from './composables.ts'

/** `mailto:`/`tel:` for text fields with `format: 'email'` or `'tel'`; other facts stay text. */
function hrefOf(name: string, text: string): string | undefined {
  const [brick, field] = name.split('.')
  const def = brick && field ? schema.bricks[brick]?.fields[field] : undefined
  if (def?.type !== 'text') return undefined
  if (def.format === 'email') return `mailto:${text}`
  if (def.format === 'tel') return `tel:${text.replace(/[^\d+]/g, '')}`
  return undefined
}

export const GinkoFact = defineComponent({
  name: 'GinkoFact',
  props: { name: { type: String, required: true } },
  setup(props) {
    const text = useGinkoFact(() => props.name)
    return () => {
      if (text.value === undefined) return null
      const href = hrefOf(props.name, text.value)
      return href ? h('a', { href }, text.value) : h('span', text.value)
    }
  },
})
