// Tag → component for <GinkoMarkdown>, each one loaded on first use. A page ships only the components its Markdown uses.
// `index.ts` keeps the eager exports a site imports to wrap a component. Keep both lists in step (lazy.test.ts checks that both have the same keys and that every entry is async).
import { defineAsyncComponent, type Component } from 'vue'

const load = (loader: () => Promise<Component>): Component => defineAsyncComponent(loader)
const vue = (loader: () => Promise<{ default: Component }>) => load(() => loader().then((m) => m.default))
const alias = (name: 'NoteCallout' | 'InfoCallout' | 'WarningCallout' | 'ErrorCallout' | 'SuccessCallout' | 'IdeaCallout') => load(() => import('./aliases').then((m) => m[name]))

export const lazyComponentMap: Record<string, Component> = {
  tabs: vue(() => import('./Tabs.vue')),
  tab: vue(() => import('./Tab.vue')),
  accordion: vue(() => import('./Accordion.vue')),
  'accordion-item': vue(() => import('./AccordionItem.vue')),
  collapse: vue(() => import('./Collapse.vue')),
  steps: vue(() => import('./Steps.vue')),
  cards: vue(() => import('./Cards.vue')),
  card: vue(() => import('./Card.vue')),
  'read-more': vue(() => import('./ReadMore.vue')),
  'inline-toc': vue(() => import('./InlineToc.vue')),
  callout: vue(() => import('./Callout.vue')),
  note: alias('NoteCallout'),
  info: alias('InfoCallout'),
  warning: alias('WarningCallout'),
  error: alias('ErrorCallout'),
  success: alias('SuccessCallout'),
  idea: alias('IdeaCallout'),
  aside: vue(() => import('./Aside.vue')),
  excerpt: vue(() => import('./Excerpt.vue')),
  dropcap: vue(() => import('./Dropcap.vue')),
  kbd: vue(() => import('./Kbd.vue')),
  badge: vue(() => import('./Badge.vue')),
  flow: vue(() => import('./Flow.vue')),
  layout: vue(() => import('./Layout.vue')),
  column: vue(() => import('./Column.vue')),
  center: vue(() => import('./Center.vue')),
  timeline: vue(() => import('./Timeline.vue')),
  'timeline-item': vue(() => import('./TimelineItem.vue')),
  pre: vue(() => import('./CodeBlock.vue')),
  'code-group': vue(() => import('./CodeGroup.vue')),
  'code-tree': vue(() => import('./CodeTree.vue')),
  files: vue(() => import('./Files.vue')),
  img: vue(() => import('./Img.vue')),
  figure: vue(() => import('./Figure.vue')),
  video: vue(() => import('./Video.vue')),
  embed: vue(() => import('./Embed.vue')),
  quiz: vue(() => import('./Quiz.vue')),
  'quiz-question': vue(() => import('./QuizQuestion.vue')),
  api: vue(() => import('./Api.vue')),
  'api-param': vue(() => import('./ApiParam.vue')),
}
