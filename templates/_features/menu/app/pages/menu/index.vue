<script setup lang="ts">
import { Printer } from '@lucide/vue'

// The menu by category (content/menu/), today's prices, vegetarian and vegan dishes, the allergen letters and their
// key. A dish taken off the menu is left out; a dish sold out today stays and says so.
const { groups, allergens } = useMenu()
const { t, localePath } = useI18n('menu')
usePageSeo(() => ({ title: t('title'), description: t('lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <NuxtLink :to="localePath('/menu/print')" class="inline-flex min-h-11 items-center gap-2 text-small font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <Printer class="size-4" aria-hidden="true" />
        {{ t('print') }}
      </NuxtLink>
    </div>
    <BlockSection v-for="group in groups" :key="group.category" :title="t(`categories.${group.category}`)">
      <ul class="flex flex-col divide-y border-y">
        <li v-for="dish in group.dishes" :key="dish.item.id">
          <MenuDish :dish="dish" />
        </li>
      </ul>
    </BlockSection>
    <BlockSection v-if="allergens.length" :title="t('allergens.title')" :lead="t('allergens.ask')">
      <MenuAllergenKey :codes="allergens" />
    </BlockSection>
    <div v-if="!groups.length" class="mx-auto max-w-page px-gutter">
      <BlockEmpty :title="t('empty')" path="content/menu/" />
    </div>
  </div>
</template>
