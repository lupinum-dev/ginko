// The Studio's components use Nuxt's built-ins (NuxtLink, ClientOnly) and their siblings without an import (Nuxt
// registers them). A mount in a test does not know them: Vue warned "Failed to resolve component" for each, with a
// component trace of thousands of lines, and on a slow CI runner the printing alone timed a test out (5 s).
// So every test gets them registered here. They are registered, not stubbed: a test that registers the real component
// (`global.components`) or stubs it (`global.stubs`) still wins. Each one renders its slot, so no text a test reads is lost.
import { config } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

/** NuxtLink as an anchor that keeps `to` (as the tests' own NuxtLink stubs do). */
const NuxtLink = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: [String, Object], default: undefined } },
  setup: (props, { slots }) => () => h('a', { href: typeof props.to === 'string' ? props.to : undefined }, slots.default?.()),
})

/** ClientOnly as its slot: a test mounts in a browser-like DOM, where the client part is what it reads. */
const ClientOnly = defineComponent({ name: 'ClientOnly', inheritAttrs: false, setup: (_, { slots }) => () => slots.default?.() })

/**
 * A sibling the test under way does not render for real: the same element Vue rendered for an unknown component
 * (its name as the tag, its props as attributes), with its slot.
 */
const sibling = (name: string) => defineComponent({ name, setup: (_, { slots }) => () => h(name, slots.default?.()) })

const siblings = ['ChangeDetail', 'ChangeDiff', 'GinkoMark', 'NavPlace', 'NavTree', 'SiteConnect', 'SiteToken', 'TranslationList']

config.global.components = {
  ...config.global.components,
  NuxtLink,
  ClientOnly,
  ...Object.fromEntries(siblings.map((name) => [name, sibling(name)])),
}
