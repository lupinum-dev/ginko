<!-- Synced from templates/_features/site/app/pages/legal/[slug].vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
// One legal text (content/legal/): privacy policy, terms, imprint. Address: /legal/<slug> in every language.
// The imprint starts with the details of content/site.md (name, address, register, VAT number, email, phone), so the
// owner writes them once; the text below adds what site.md cannot hold. Shown when site.md has an address.
const route = useRoute()
const entry = useGinkoEntry('legal', () => route.params.slug)
const site = useGinko('site')
const { t, format } = useI18n('site')
const details = computed(() => (entry.value.data.legalType === 'imprint' && site.value.data.city ? site.value.data : undefined))
const registry = computed(() => [details.value?.registryCourt, details.value?.registryNumber].filter(Boolean).join(', '))
const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
usePageSeo(() => ({ title: entry.value.data.title, description: entry.value.data.description }))
</script>

<template>
  <div>
    <BlockPageHeader
      :title="entry.data.title"
      :lead="entry.data.description"
      :meta="t('updated', { date: format.date(entry.data.updatedAt) })"
    />
    <div v-if="details" class="mx-auto max-w-page px-gutter pb-10">
      <!-- Each line keeps the direction of its own text (bdi), as in the footer; email and phone are left to right. -->
      <dl class="flex max-w-prose flex-col gap-4 sm:grid sm:grid-cols-[auto_1fr] sm:items-baseline sm:gap-x-8 sm:gap-y-2">
        <div class="flex flex-col sm:contents">
          <dt class="text-small text-muted-foreground">{{ t('imprint.address') }}</dt>
          <dd>
            <address class="flex flex-col not-italic">
              <span v-if="details.legalName"><bdi>{{ details.legalName }}</bdi></span>
              <span v-if="details.street"><bdi>{{ details.street }}</bdi></span>
              <span><bdi>{{ details.postalCode }} {{ details.city }}</bdi></span>
            </address>
          </dd>
        </div>
        <div v-if="registry" class="flex flex-col sm:contents">
          <dt class="text-small text-muted-foreground">{{ t('imprint.registry') }}</dt>
          <dd><bdi>{{ registry }}</bdi></dd>
        </div>
        <div v-if="details.vatId" class="flex flex-col sm:contents">
          <dt class="text-small text-muted-foreground">{{ t('imprint.vat') }}</dt>
          <dd dir="ltr" class="justify-self-start">{{ details.vatId }}</dd>
        </div>
        <div v-if="details.email" class="flex flex-col sm:contents">
          <dt class="text-small text-muted-foreground">{{ t('imprint.email') }}</dt>
          <dd><a :href="`mailto:${details.email}`" dir="ltr" class="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{{ details.email }}</a></dd>
        </div>
        <div v-if="details.phone" class="flex flex-col sm:contents">
          <dt class="text-small text-muted-foreground">{{ t('imprint.phone') }}</dt>
          <dd><a :href="tel(details.phone)" dir="ltr" class="inline-flex min-h-11 items-center text-primary tabular-nums underline underline-offset-4">{{ details.phone }}</a></dd>
        </div>
      </dl>
    </div>
    <ProseBody :value="entry.data.body" />
  </div>
</template>
