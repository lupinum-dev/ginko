<script setup lang="ts">
import type { Component } from 'vue'
import { faqJsonLd } from '@lupinum/ginko/basics'

// The FAQ page (page key `faq`): the questions and answers of content/faq/ in the owner's order, as an accordion whose
// questions are the page's h2, with FAQPage JSON-LD. Below them, one line leads to a person for a question that is not
// listed: the site's contact page (`pages/contact`) when it has one, else the email, phone and address of
// content/site.md (SiteContact). The address per language comes from `pages.faq` in ginko.config.ts; a template sets
// its own title and lead with `faq.title` and `faq.lead` in its i18n/<code>.json. A template may bring
// `app/components/site/PageCta.vue`, its closing band: it shows at the end of the page.
const cta = Object.values(import.meta.glob<Component>('../components/site/PageCta.vue', { eager: true, import: 'default' }))[0]
const questions = useGinko('faq')
const contact = useSiteLinks(() => [{ entry: 'pages/contact' }])
const { t } = useI18n('faq')
const items = computed(() => questions.value.items.map((item) => ({ id: item.id, question: item.data.question, answer: item.data.answer })))
usePageSeo(() => ({ title: t('title'), description: t('lead'), jsonLd: items.value.length ? [faqJsonLd(items.value)] : [] }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <div v-if="items.length" class="flex max-w-prose flex-col gap-8">
        <BlockFaq :items="items" heading-level="h2" />
        <p v-if="contact[0]" data-faq-contact>
          {{ t('more') }}
          <NuxtLink :to="contact[0].to" class="-my-2.5 inline-block py-2.5 font-medium text-primary underline underline-offset-4">{{ contact[0].label }}</NuxtLink>
        </p>
        <div v-else class="flex flex-col gap-2" data-faq-contact>
          <p>{{ t('more') }}</p>
          <SiteContact />
        </div>
      </div>
      <BlockEmpty v-else :title="t('empty')" path="content/faq/" />
    </div>
    <component :is="cta" v-if="cta" />
  </div>
</template>
