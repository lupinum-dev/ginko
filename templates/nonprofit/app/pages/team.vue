<!-- Synced from templates/_features/people/app/pages/team.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { Component } from 'vue'
import { personJsonLd } from '@lupinum/ginko/basics'

// The team or board: every entry of content/people/ in its order, with Person JSON-LD. The address per language
// comes from `pages.team` in ginko.config.ts. A template may bring `app/components/people/TeamContact.vue` (the
// company: its service line and office); the page then shows it between the header and the people, without a copy
// of this page per template.
const contact = Object.values(import.meta.glob<Component>('../components/people/TeamContact.vue', { eager: true, import: 'default' }))[0]
const people = useGinko('people')
const { name, url } = useGinkoSite()
const { t } = useI18n('people')
usePageSeo(() => ({
  title: t('title'),
  description: t('lead'),
  jsonLd: people.value.items.map((person) => personJsonLd({
    name: person.data.name,
    role: person.data.role,
    bio: person.data.bio,
    email: person.data.email,
    phone: person.data.phone,
    image: person.data.photo ? new URL(person.data.photo.url, url).href : undefined,
    worksFor: { name, url },
  })),
}))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto flex max-w-page flex-col gap-12 px-gutter md:gap-16">
      <component :is="contact" v-if="contact" />
      <PeopleList v-if="people.items.length" :items="people.items" />
      <BlockEmpty v-else :title="t('empty')" path="content/people/" />
    </div>
  </div>
</template>
