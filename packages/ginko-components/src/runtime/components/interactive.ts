// The Vue components of the interactive tags (registry: `registry-interactive.ts`). Spread into `componentMap` in `index.ts`.
import type { Component } from 'vue'
import Accordion from './Accordion.vue'
import AccordionItem from './AccordionItem.vue'
import Card from './Card.vue'
import Cards from './Cards.vue'
import Collapse from './Collapse.vue'
import InlineToc from './InlineToc.vue'
import ReadMore from './ReadMore.vue'
import Steps from './Steps.vue'
import Tab from './Tab.vue'
import Tabs from './Tabs.vue'

export { Accordion, AccordionItem, Card, Cards, Collapse, InlineToc, ReadMore, Steps, Tab, Tabs }

export const interactiveMap: Record<string, Component> = {
  tabs: Tabs,
  tab: Tab,
  accordion: Accordion,
  'accordion-item': AccordionItem,
  collapse: Collapse,
  steps: Steps,
  cards: Cards,
  card: Card,
  'read-more': ReadMore,
  'inline-toc': InlineToc,
}
