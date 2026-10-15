<!-- Synced from templates/_features/site/app/pages/legal/[slug].vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
// One legal text (content/legal/): privacy policy, terms, imprint. Address: /legal/<slug> in every language.
// The imprint starts with the details of content/site.md (name, address, register, VAT number, email, phone), so the
// owner writes them once; the text below adds what site.md cannot hold. Shown when site.md has an address. Email and
// phone are text here: the footer of every page links them.
const route = useRoute()
const entry = useGinkoEntry('legal', () => route.params.slug)
const site = useGinko('site')
const { t, format } = useI18n('site')
const details = computed(() => {
  const d = site.value.data
  if (entry.value.data.legalType !== 'imprint' || !d.city) return []
  return [
    [t('imprint.address'), [d.legalName, d.street, `${d.postalCode ?? ''} ${d.city}`].filter(Boolean).join('\n')],
    [t('imprint.registry'), [d.registryCourt, d.registryNumber].filter(Boolean).join(', ')],
    [t('imprint.vat'), d.vatId],
    [t('imprint.email'), d.email],
    [t('imprint.phone'), d.phone],
  ].filter(([, value]) => value)
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
    <!-- Each value keeps the direction of its own text (bdi), as in the footer. -->
    <dl v-if="details.length" class="mx-auto grid max-w-page gap-x-8 gap-y-1 px-gutter pb-10 sm:grid-cols-[auto_1fr] sm:gap-y-3">
      <template v-for="[label, value] in details" :key="label">
        <dt class="text-small text-muted-foreground max-sm:not-first:mt-3">{{ label }}</dt>
        <dd class="whitespace-pre-line"><bdi>{{ value }}</bdi></dd>
      </template>
    </dl>
    <ProseBody :value="entry.data.body" />
  </div>
</template>
