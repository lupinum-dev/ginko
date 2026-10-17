<!-- Synced from templates/_features/menu/app/pages/menu/print.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { formatMoney } from '@lupinum/ginko'
import { ArrowLeft, Printer } from '@lucide/vue'

// The menu on paper (A4): the name, every dish with its price, vegetarian or vegan and its allergen codes, the key,
// the address and the day it was printed ("As of"), so an old printout shows its age. Not in the sitemap and not
// indexed: the menu page is the one to find.
definePageMeta({ layout: 'print' })
const { groups, allergens } = useMenu()
const site = useGinko('site')
const { name } = useGinkoSite()
const { t, format, language } = useI18n('menu')
const today = useGinkoToday()
const path = useGinkoPath()
const langOf = useGinkoLang()
const contact = computed(() => site.value.data)
usePageSeo(() => ({ title: t('title'), noindex: true }))
const print = () => window.print()
// The letters, or on paper too: "no allergens" only when the dish says so, else "please ask us" (nothing entered).
const allergenText = (codes: string[]) => {
  const state = allergenState(codes)
  return state === 'letters' ? allergenList(codes).join(' ') : t(state === 'none' ? 'allergens.none' : 'allergens.unknown')
}
const diet = (veg: unknown) => (veg === 'vegan' ? t('diet.vegan') : veg === 'vegetarian' ? t('diet.vegetarian') : undefined)
</script>

<template>
  <div class="mx-auto max-w-3xl px-gutter py-8 print:max-w-none print:p-0">
    <div class="mb-10 flex flex-wrap items-center justify-between gap-4 print:hidden">
      <NuxtLink :to="path('menu')" class="inline-flex min-h-11 items-center gap-2 text-small font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <ArrowLeft class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {{ t('back') }}
      </NuxtLink>
      <Button @click="print">
        <Printer aria-hidden="true" />
        {{ t('printNow') }}
      </Button>
    </div>

    <header class="flex flex-col gap-1 border-b pb-4">
      <p class="font-display text-h3">{{ name }}</p>
      <h1 class="text-h2">{{ t('title') }}</h1>
    </header>

    <section v-for="group in groups" :key="group.category" class="mt-8" :aria-labelledby="`print-${group.category}`">
      <h2 :id="`print-${group.category}`" class="text-h3">{{ t(`categories.${group.category}`) }}</h2>
      <ul class="mt-2 flex flex-col divide-y border-y">
        <li v-for="dish in group.dishes" :key="dish.item.id" class="flex items-baseline justify-between gap-6 py-2.5 break-inside-avoid">
          <div class="flex flex-col">
            <p class="font-medium">
              <span :lang="langOf(dish.item, 'name')">{{ dish.item.data.name }}</span>
              <span v-if="diet(dish.item.data.veg)" class="ms-2 text-small font-normal text-muted-foreground">{{ diet(dish.item.data.veg) }}</span>
              <span class="ms-2 text-small font-normal tracking-wide text-muted-foreground">{{ allergenText(dish.item.data.allergens.map(String)) }}</span>
            </p>
            <p v-if="dish.item.data.description" class="text-small text-muted-foreground" :lang="langOf(dish.item, 'description')">{{ dish.item.data.description }}</p>
          </div>
          <p class="shrink-0 tabular-nums">{{ formatMoney(dish.price, language) }}</p>
        </li>
      </ul>
    </section>

    <section v-if="allergens.length" class="mt-8 break-inside-avoid text-small" aria-labelledby="print-allergens">
      <h2 id="print-allergens" class="text-body font-semibold">{{ t('allergens.title') }}</h2>
      <div class="mt-2"><MenuAllergenKey :codes="allergens" /></div>
      <p class="mt-3 text-muted-foreground">{{ t('allergens.ask') }}</p>
    </section>

    <footer class="mt-10 flex flex-wrap justify-between gap-x-6 gap-y-1 border-t pt-3 text-small text-muted-foreground">
      <p>{{ name }}<template v-if="contact.street">, {{ contact.street }}</template><template v-if="contact.city">, {{ contact.postalCode }} {{ contact.city }}</template><template v-if="contact.phone">, <span class="tabular-nums">{{ contact.phone }}</span></template></p>
      <p class="tabular-nums">{{ t('prices') }} {{ t('asOf', { date: format.date(today, { day: 'numeric', month: 'long', year: 'numeric' }) }) }}</p>
    </footer>
  </div>
</template>
