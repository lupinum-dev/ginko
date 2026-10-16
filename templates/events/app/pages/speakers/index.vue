<!-- Synced from templates/_features/sessions/app/pages/speakers/index.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { personJsonLd } from '@lupinum/ginko/basics'

// Everyone who speaks (content/people/), in the owner's order, each linked to their page with their sessions. The
// address per language comes from `pages.speakers` in ginko.config.ts.
const people = useGinko('people')
const { url } = useGinkoSite()
const { t } = useI18n('sessions')
const absolute = (path: string) => new URL(path, url).href
usePageSeo(() => ({
  title: t('speakers.title'),
  description: t('speakers.lead'),
  jsonLd: people.value.items.map((person) => personJsonLd({
    name: person.data.name,
    role: person.data.role,
    image: person.data.photo ? absolute(person.data.photo.url) : undefined,
    url: absolute(person.url),
  })),
}))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('speakers.title')" :lead="t('speakers.lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <SessionSpeakers v-if="people.items.length" :items="people.items" heading="h2" />
      <BlockEmpty v-else :title="t('speakers.empty')" path="content/people/" />
    </div>
  </div>
</template>
