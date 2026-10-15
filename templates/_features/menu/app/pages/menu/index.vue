<script setup lang="ts">
import { Printer } from '@lucide/vue'

// The menu by category (content/menu/), today's prices, vegetarian and vegan dishes, the allergen codes and their
// key. A dish taken off the menu is left out; a dish sold out today stays and says so. A row of links under the
// header jumps to each category, so a long menu on a phone needs no scrolling to find the desserts.
const { groups, allergens } = useMenu()
const { t, localePath } = useI18n('menu')
usePageSeo(() => ({ title: t('title'), description: t('lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto flex max-w-page flex-col gap-2 px-gutter">
      <NuxtLink :to="localePath('/menu/print')" data-menu-print class="inline-flex min-h-11 items-center gap-2 self-start text-small font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <Printer class="size-4" aria-hidden="true" />
        {{ t('print') }}
      </NuxtLink>
      <nav v-if="groups.length > 1" :aria-label="t('jump')">
        <ul class="flex flex-wrap gap-x-5 text-small">
          <li v-for="group in groups" :key="group.category">
            <a :href="`#menu-${group.category}`" class="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">{{ t(`categories.${group.category}`) }}</a>
          </li>
        </ul>
      </nav>
    </div>
    <BlockSection v-for="group in groups" :id="`menu-${group.category}`" :key="group.category" :title="t(`categories.${group.category}`)">
      <ul class="flex flex-col divide-y border-y">
        <li v-for="dish in group.dishes" :key="dish.item.id">
          <MenuDish :dish="dish" />
        </li>
      </ul>
    </BlockSection>
    <BlockSection v-if="allergens.length" id="allergens" :title="t('allergens.title')" :lead="`${t('allergens.lead')} ${t('allergens.ask')}`">
      <div class="flex flex-col gap-6">
        <MenuAllergenKey :codes="allergens" />
        <p class="text-small text-muted-foreground">{{ t('prices') }}</p>
      </div>
    </BlockSection>
    <div v-if="!groups.length" class="mx-auto max-w-page px-gutter">
      <BlockEmpty :title="t('empty')" path="content/menu/" />
    </div>
  </div>
</template>
