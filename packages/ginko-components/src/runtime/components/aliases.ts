// `::warning{title="…"}` is `::callout{type="warning"}`: the same component with a fixed type.
import { defineComponent, h } from 'vue'
import Callout from './Callout.vue'

const alias = (type: string) => defineComponent({
  name: `Ginko${type[0]!.toUpperCase()}${type.slice(1)}`,
  props: { title: { type: String, default: undefined }, icon: { type: String, default: undefined }, appearance: { type: String as () => 'quiet' | 'tint', default: undefined } },
  setup: (props, { slots }) => () => h(Callout, { type, title: props.title, icon: props.icon, appearance: props.appearance }, slots),
})

export const NoteCallout = alias('note')
export const InfoCallout = alias('info')
export const WarningCallout = alias('warning')
export const ErrorCallout = alias('error')
export const SuccessCallout = alias('success')
export const IdeaCallout = alias('idea')
