<script setup lang="ts">
// One legal text (content/legal/): privacy policy, terms, imprint. Address: /legal/<slug> in every language.
// The imprint starts with the details of content/site.md (name, address, register, VAT number, email, phone), so the
// owner writes them once; the text below adds what site.md cannot hold. A detail site.md does not have is left out.
// Email and phone are links (mailto:, tel:), like on the contact page.
const route = useRoute()
const entry = useGinkoEntry('legal', () => route.params.slug)
const site = useGinko('site')
const { t, format } = useI18n('site')
const details = computed(() => {
  const d = site.value.data
  if (entry.value.data.legalType !== 'imprint') return []
  const rows: { label: string, value?: string, href?: string }[] = [
    { label: t('imprint.address'), value: [d.legalName, d.street, d.city ? `${d.postalCode ?? ''} ${d.city}` : undefined].filter(Boolean).join('\n') },
    { label: t('imprint.registry'), value: [d.registryCourt, d.registryNumber].filter(Boolean).join(', ') },
    { label: t('imprint.vat'), value: d.vatId },
    { label: t('imprint.email'), value: d.email, href: d.email ? `mailto:${d.email}` : undefined },
    { label: t('imprint.phone'), value: d.phone, href: d.phone ? telHref(d.phone) : undefined },
  ]
  return rows.filter((row) => row.value)
})
usePageSeo(() => ({ title: entry.value.data.title, description: entry.value.data.description }))
</script>

<template>
  <div>
    <BlockPageHeader
      :title="entry.data.title"
      :lead="entry.data.description"
      :meta="t('updated', { date: format.date(entry.data.updatedAt) })"
    />
    <!-- Each value keeps the direction of its own text (bdi), as in the footer. A link gets its 44 px tap height from
         padding with a negative margin, so it stays on its label's line. -->
    <dl v-if="details.length" class="mx-auto grid max-w-page gap-x-8 gap-y-1 px-gutter pb-10 sm:grid-cols-[auto_1fr] sm:gap-y-3">
      <template v-for="row in details" :key="row.label">
        <dt class="text-small text-muted-foreground max-sm:not-first:mt-3">{{ row.label }}</dt>
        <dd class="whitespace-pre-line">
          <a v-if="row.href" :href="row.href" dir="ltr" class="-my-2.5 inline-block py-2.5 underline underline-offset-4">{{ row.value }}</a>
          <bdi v-else>{{ row.value }}</bdi>
        </dd>
      </template>
    </dl>
    <ProseBody :value="entry.data.body" />
  </div>
</template>
