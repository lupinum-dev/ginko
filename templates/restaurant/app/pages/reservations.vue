<script setup lang="ts">
import { plainText, type Json } from '@lupinum/ginko'
import { Mail, Phone } from '@lucide/vue'

// How to reserve: one call button (the primary action) and an email button with the number and address of
// content/site.md, whether anyone answers right now, the text of content/reservations.md, and the opening hours, since
// a table is booked by phone during them. Each `##` of the text becomes a BlockSection (heading left, text right), like the hours. No form: nothing is sent to other companies.
const page = useGinko('reservations')
const site = useGinko('site')
const { t } = useI18n('reservations')
const { t: th } = useI18n('hours')
const langOf = useGinkoLang()
const contact = computed(() => site.value.data)
const body = await useGinkoMarkdown(() => page.value.data.body)
// The text split at its `##` headings: what comes before the first one, then one section per heading.
const parts = computed(() => {
  const intro: Json[] = []
  const sections: { title: string; nodes: Json[] }[] = []
  for (const node of body.value?.nodes ?? []) {
    if (Array.isArray(node) && node[0] === 'h2') sections.push({ title: plainText({ nodes: [node] }), nodes: [] })
    else (sections.at(-1)?.nodes ?? intro).push(node)
  }
  return { intro, sections }
})
usePageSeo(() => ({ title: page.value.data.title, description: page.value.data.lead ?? undefined }))
</script>

<template>
  <article>
    <BlockPageHeader :title="page.data.title" :lead="page.data.lead ?? undefined" />
    <div class="mx-auto flex max-w-page flex-col gap-4 px-gutter pb-10">
      <div v-if="contact.phone || contact.email" class="flex flex-wrap gap-3">
        <Button v-if="contact.phone" as-child size="lg" class="max-sm:w-full">
          <a :href="telHref(contact.phone)"><Phone aria-hidden="true" />{{ t('call', { phone: contact.phone }) }}</a>
        </Button>
        <Button v-if="contact.email" as-child size="lg" :variant="contact.phone ? 'outline' : 'default'" class="max-sm:w-full">
          <a :href="`mailto:${contact.email}`"><Mail aria-hidden="true" />{{ t('email') }}</a>
        </Button>
      </div>
      <HoursToday />
    </div>
    <div v-if="parts.intro.length" :lang="langOf(page, 'body')">
      <ProseBody :value="{ nodes: parts.intro }" />
    </div>
    <BlockSection v-for="section in parts.sections" :key="section.title" :title="section.title" :lang="langOf(page, 'body')">
      <GinkoMarkdown :value="{ nodes: section.nodes }" class="prose" />
    </BlockSection>
    <BlockSection :title="th('title')">
      <HoursTable />
    </BlockSection>
  </article>
</template>
