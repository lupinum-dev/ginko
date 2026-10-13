---
title: Inhalte für Nuxt-Seiten, die Inhaber selbst pflegen.
description: Ginko trennt die Seite von ihren Inhalten. Entwickler bauen mit normalem Nuxt. Inhaber ändern Öffnungszeiten, Speisekarte und Texte im Studio, mit Freigabe und Zeitplan. Lupinum betreibt das Studio, der Zugang ist auf Einladung; ohne Studio lesen dieselben Bausteine Markdown aus dem Repo.
install: npm create ginko@latest my-site
links:
  - label: Loslegen
    href: /docs/einstieg
  - label: GitHub
    href: https://github.com/lupinum-dev/ginko
features:
  - icon: lucide:blocks
    title: Bausteine statt Schema-Arbeit
    description: Ein Baustein beschreibt einen Inhaltstyp mit Feldern. Daraus entstehen Formular, Prüfung, Typen und Bundle.
    href: /docs/bausteine
  - icon: lucide:file-text
    title: Dateien oder Plattform
    description: Derselbe Baustein liest heute Markdown aus dem Repo und morgen die Plattform. Der Code der Seite bleibt gleich.
    href: /docs/inhalte-aus-dateien
  - icon: lucide:languages
    title: Sprachen eingebaut
    description: Adressen pro Sprache, hreflang, Sprachwechsel und Übersetzungstexte mit ICU, ohne zweites Modul.
    href: /docs/sprachen
  - icon: lucide:shield-check
    title: Freigabe vor dem Livegang
    description: Änderungen können eine Freigabe brauchen, gehen zu einem Zeitpunkt live und lassen sich zurücknehmen. Lupinum betreibt das Studio, der Zugang ist auf Einladung.
    href: /docs/plattform-und-cli
  - icon: lucide:component
    title: Komponenten für Markdown
    description: Hinweise, Tabs, Schritte, Karten, Code-Gruppen und mehr, mit Feldern im Studio und als shadcn-vue-Registry.
    href: /docs/komponenten
  - icon: lucide:bot
    title: Lesbar für Agenten
    description: Jede Seite gibt es als Markdown, dazu llms.txt und einen MCP-Zugang zur Doku.
    href: /docs/seo-und-agenten
---

## Ein Baustein, eine Seite, ein Inhalt

Ein **Baustein** in `ginko.config.ts` beschreibt eine Art von Inhalt. Die Seite liest ihn mit einem Composable. Der Inhalt steht in einer Markdown-Datei oder kommt von der Plattform, wo Inhaber ihn im **Studio** bearbeiten. In beiden Fällen bekommt die Seite ihn als **Bundle**: alle Inhalte einer Sprache in einer JSON-Antwort.

::code-group
```ts [ginko.config.ts]
import { defineSite, single, f } from '@lupinum/ginko'

export default defineSite({
  site: 'linde',
  name: 'Gasthaus zur Linde',
  url: 'https://linde.example',
  timeZone: 'Europe/Vienna',
  locales: ['de', 'en'],
  currency: 'EUR',
  pages: { home: { de: '/', en: '/en' } },
  bricks: {
    hours: single({
      label: 'Öffnungszeiten',
      source: 'files',
      fields: { note: f.text('Hinweis', { optional: true }), text: f.markdown('Zeiten') },
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
note: Am 24. Dezember geschlossen.
---

Dienstag bis Samstag 11–22 Uhr, Sonntag 11–15 Uhr.
```
::

Weiter geht es mit dem [Einstieg]($docs.einstieg). Wie sich Ginko von Nuxt Content, einem gehosteten CMS oder einem Git-Editor unterscheidet, steht unter [Vergleich und Umstieg]($docs.umstieg).
