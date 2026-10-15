<script setup lang="ts">
import { Mail, Phone } from '@lucide/vue'

// How to reserve: one call button (the primary action) and an email button with the number and address of
// content/site.md, whether anyone answers right now, the text of content/reservations.md, and the opening hours, since
// a table is booked by phone during them. No form: nothing is sent to other companies.
const page = useGinko('reservations')
const site = useGinko('site')
const { t } = useI18n('reservations')
const { t: th } = useI18n('hours')
const langOf = useGinkoLang()
const contact = computed(() => site.value.data)
const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
usePageSeo(() => ({ title: page.value.data.title, description: page.value.data.lead ?? undefined }))
</script>

<template>
  <article>
    <BlockPageHeader :title="page.data.title" :lead="page.data.lead ?? undefined" />
    <div class="mx-auto flex max-w-page flex-col gap-4 px-gutter pb-10">
      <div v-if="contact.phone || contact.email" class="flex flex-wrap gap-3">
        <Button v-if="contact.phone" as-child size="lg" class="max-sm:w-full">
          <a :href="tel(contact.phone)"><Phone aria-hidden="true" />{{ t('call', { phone: contact.phone }) }}</a>
        </Button>
        <Button v-if="contact.email" as-child size="lg" :variant="contact.phone ? 'secondary' : 'primary'" class="max-sm:w-full">
          <a :href="`mailto:${contact.email}`"><Mail aria-hidden="true" />{{ t('email') }}</a>
        </Button>
      </div>
      <HoursToday />
    </div>
    <div :lang="langOf(page, 'body')">
      <ProseBody :value="page.data.body" />
    </div>
    <BlockSection :title="th('title')">
      <HoursTable />
    </BlockSection>
  </article>
</template>
