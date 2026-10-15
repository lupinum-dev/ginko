<!-- Synced from templates/_features/menu/app/components/menu/Dish.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { formatMoney } from '@lupinum/ginko'

/** One dish: name and today's price on one line, the description, then vegetarian or vegan and the allergen letters.
 *  A dish sold out today says so in words; a price change within two weeks is announced under the price. */
defineProps<{ dish: ReturnType<typeof useMenu>['dishes']['value'][number] }>()
const { t, format, language } = useI18n('menu')
const langOf = useGinkoLang()
</script>

<template>
  <div class="flex flex-col gap-1.5 py-4 break-inside-avoid">
    <div class="flex items-baseline justify-between gap-6">
      <h3 class="text-body font-semibold" :class="dish.soldOut && 'text-muted-foreground'">
        <span :lang="langOf(dish.item, 'name')">{{ dish.item.data.name }}</span>
        <template v-if="dish.soldOut">{{ ' ' }}<span class="ms-1 text-small font-medium whitespace-nowrap text-foreground">{{ t('soldOut') }}</span></template>
      </h3>
      <p class="shrink-0 text-body tabular-nums" :class="dish.soldOut && 'text-muted-foreground'">{{ formatMoney(dish.price, language) }}</p>
    </div>
    <p v-if="dish.next" class="text-small text-muted-foreground tabular-nums">
      {{ t('priceFrom', { date: format.date(dish.next.from, { day: 'numeric', month: 'long' }), price: formatMoney(dish.next.price, language) }) }}
    </p>
    <p v-if="dish.item.data.description" class="max-w-prose text-small text-muted-foreground" :lang="langOf(dish.item, 'description')">{{ dish.item.data.description }}</p>
    <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <MenuDiet :veg="String(dish.item.data.veg)" />
      <MenuAllergens :codes="dish.item.data.allergens.map(String)" />
    </div>
  </div>
</template>
