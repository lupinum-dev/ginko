---
title: Content for Nuxt sites that owners keep current themselves.
description: Ginko keeps a site apart from its content. Developers build with plain Nuxt. Owners change opening hours, menus and texts in the Studio, with approval and scheduling. Lupinum hosts the Studio and opens it by invitation; without it, the same bricks read Markdown from the repository.
links:
  - label: Get started
    href: /en/docs/getting-started
  - label: GitHub
    href: https://github.com/lupinum-dev/ginko
features:
  - title: Bricks instead of schema work
    description: A brick describes one kind of content with fields. The form, the checks, the types and the bundle all come from it.
    href: /en/docs/bricks
  - title: Files or platform
    description: The same brick reads Markdown from the repository today and the platform tomorrow. The site code stays the same.
    href: /en/docs/content-from-files
  - title: Languages built in
    description: Addresses per language, hreflang, a language switcher and ICU messages, without a second module.
    href: /en/docs/languages
  - title: Approval before it goes live
    description: Changes can need a yes, go live at a set time, and can be taken back. The Studio is hosted by Lupinum, by invitation.
    href: /en/docs/platform-and-cli
  - title: Components for Markdown
    description: Callouts, tabs, steps, cards, code groups and more, with fields in the Studio and as a shadcn-vue registry.
    href: /en/docs/components
  - title: Readable by agents
    description: Every page also exists as Markdown, plus llms.txt and an MCP endpoint for the docs.
    href: /en/docs/seo-and-agents
---

## One brick, one page, one piece of content

A **brick** in `ginko.config.ts` describes one kind of content. The page reads it with one composable. The content lives in a Markdown file or comes from the platform, where owners edit it in the **Studio**. Either way, the site receives it as a **bundle**: all content of one language in one JSON response.

::code-group
```ts [ginko.config.ts]
import { defineSite, single, f } from '@lupinum/ginko'

export default defineSite({
  site: 'linde',
  name: 'Linden Inn',
  url: 'https://linde.example',
  timeZone: 'Europe/Vienna',
  locales: ['en', 'de'],
  currency: 'EUR',
  pages: { home: { en: '/', de: '/de' } },
  bricks: {
    hours: single({
      label: 'Opening hours',
      source: 'files',
      fields: { note: f.text('Note', { optional: true }), text: f.markdown('Hours') },
    }),
  },
})
```
```vue [app/pages/index.vue]
<script setup lang="ts">
const hours = useGinko('hours')
</script>

<template>
  <GinkoMarkdown :value="hours.data.text" />
</template>
```
```md [content/hours.md]
---
note: Closed on 24 December.
---

Tuesday to Saturday 11 am–10 pm, Sunday 11 am–3 pm.
```
::

Continue with [Getting started]($docs.einstieg). To compare Ginko with Nuxt Content, a hosted CMS or a Git-based editor, read [Compare and switch]($docs.umstieg).
