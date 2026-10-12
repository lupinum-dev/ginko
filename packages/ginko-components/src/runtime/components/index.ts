// The Vue components behind the registry, tag → component. A site can import one to wrap it in an override.
import type { Component } from 'vue'
import { ErrorCallout, IdeaCallout, InfoCallout, NoteCallout, SuccessCallout, WarningCallout } from './aliases'
import Aside from './Aside.vue'
import Badge from './Badge.vue'
import Callout from './Callout.vue'
import Center from './Center.vue'
import Column from './Column.vue'
import Dropcap from './Dropcap.vue'
import Excerpt from './Excerpt.vue'
import Flow from './Flow.vue'
import Kbd from './Kbd.vue'
import Layout from './Layout.vue'
import Timeline from './Timeline.vue'
import TimelineItem from './TimelineItem.vue'
import { interactiveMap } from './interactive'

export { Accordion, AccordionItem, Card, Cards, Collapse, InlineToc, ReadMore, Steps, Tab, Tabs } from './interactive'

// Code components
import CodeBlock from './CodeBlock.vue'
import CodeGroup from './CodeGroup.vue'
import CodeTree from './CodeTree.vue'
import Files from './Files.vue'

export { CodeBlock, CodeGroup, CodeTree, Files }

// Media components
import Figure from './Figure.vue'
import Img from './Img.vue'
import Video from './Video.vue'
import Embed from './Embed.vue'

export { Embed, Figure, Img, Video }

// Quiz and api components
import Api from './Api.vue'
import ApiParam from './ApiParam.vue'
import Quiz from './Quiz.vue'
import QuizQuestion from './QuizQuestion.vue'

export { Api, ApiParam, Quiz, QuizQuestion }

const mediaMap: Record<string, Component> = { img: Img, figure: Figure, video: Video, embedded: Embed }

const extraMap: Record<string, Component> = { quiz: Quiz, 'quiz-question': QuizQuestion, api: Api, 'api-param': ApiParam }

const codeMap: Record<string, Component> = { pre: CodeBlock, 'code-group': CodeGroup, 'code-tree': CodeTree, files: Files }

export {
  Aside, Badge, Callout, Center, Column, Dropcap, ErrorCallout, Excerpt, Flow, IdeaCallout, InfoCallout, Kbd, Layout, NoteCallout,
  SuccessCallout, Timeline, TimelineItem, WarningCallout,
}

/** Tag → component. The keys are the tags of `registry.ts`. */
export const componentMap: Record<string, Component> = {
  ...interactiveMap,
  callout: Callout,
  note: NoteCallout,
  info: InfoCallout,
  warning: WarningCallout,
  error: ErrorCallout,
  success: SuccessCallout,
  idea: IdeaCallout,
  aside: Aside,
  excerpt: Excerpt,
  dropcap: Dropcap,
  kbd: Kbd,
  badge: Badge,
  flow: Flow,
  layout: Layout,
  column: Column,
  center: Center,
  timeline: Timeline,
  'timeline-item': TimelineItem,
  ...codeMap,
  ...mediaMap,
  ...extraMap,
}
