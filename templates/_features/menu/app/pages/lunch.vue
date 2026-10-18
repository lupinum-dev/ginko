<script setup lang="ts">
// The lunch menu of the week (content/lunch.md): shown for this work week only (at the weekend the coming one), so an
// old week never stays online. When lunch is served (the day's first opening span); today is marked; a closed day says
// so instead of a dish. A placeholder day (a fresh site) adds nothing to the allergen key.
import { isLunchPlaceholder } from '@lupinum/ginko-preset-gastro'
const { lunch, week, days, served } = useLunch()
const { t, format } = useI18n('menu')
const langOf = useGinkoLang()
const range = computed(() => (days.value.length ? format.range(days.value[0]!.date, days.value.at(-1)!.date, { day: 'numeric', month: 'long' }) : undefined))
const used = computed(() => days.value.filter((day) => !day.closed && !isLunchPlaceholder(day.dish)).flatMap((day) => day.allergens.map(String)))
usePageSeo(() => ({ title: t('lunch.title'), description: week.value ? `${t('lunch.title')}: ${range.value}` : t('lunch.pending') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('lunch.title')" :lead="week ? range : t('lunch.pending')" />
    <div v-if="week" class="mx-auto flex max-w-page flex-col gap-10 px-gutter">
      <div class="flex max-w-4xl flex-col gap-4">
        <p v-if="served" class="tabular-nums">{{ t('lunch.served', { from: served.from, to: served.to }) }}</p>
        <MenuLunchDays />
        <p v-if="lunch.data.note" class="text-muted-foreground" :lang="langOf(lunch, 'note')">{{ lunch.data.note }}</p>
      </div>
      <section v-if="used.length" class="flex max-w-4xl flex-col gap-4" aria-labelledby="lunch-allergens">
        <h2 id="lunch-allergens" class="text-h3">{{ t('allergens.title') }}</h2>
        <MenuAllergenKey :codes="used" />
      </section>
    </div>
  </div>
</template>
