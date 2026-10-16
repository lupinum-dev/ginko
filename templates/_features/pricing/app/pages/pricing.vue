<script setup lang="ts">
import type { Component } from 'vue'

// The plans in their order (content/pricing/), with the price per month and per year in the site's currency, the VAT
// note from `vat` in app.config.ts, and a Product with two Offers per priced plan for search engines. The address per
// language comes from `pages.pricing` in ginko.config.ts. A template may bring `app/components/pricing/More.vue`: it
// shows below the plans (the saas template: questions about billing); without that file, nothing is added.
const plans = usePlans()
const vat = usePricingVat()
const jsonLd = usePricingJsonLd()
const { t } = useI18n('pricing')
const more = Object.values(import.meta.glob<Component>('../components/pricing/More.vue', { eager: true, import: 'default' }))[0]
usePageSeo(() => ({ title: t('title'), description: t('lead'), jsonLd: jsonLd.value }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto flex max-w-page flex-col gap-6 px-gutter">
      <PricingPlans v-if="plans.length" :plans="plans" />
      <BlockEmpty v-else :title="t('empty')" path="content/pricing/" />
      <p v-if="plans.length && vat" class="text-small text-muted-foreground">{{ vat }}</p>
    </div>
    <component :is="more" v-if="more" />
  </div>
</template>
