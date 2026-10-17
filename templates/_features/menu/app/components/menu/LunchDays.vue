<script setup lang="ts">
import { formatMoney } from '@lupinum/ginko'
import { isLunchPlaceholder } from '@lupinum/ginko-preset-gastro'

/** The lunch days of the week shown: weekday and date, the dish, its price and allergen letters. Days before today
 *  are left out on screen (a guest cannot order them) and stay on paper. Today is marked in words; a day the place
 *  is closed says "Closed" instead of a dish. A day still holding the placeholder dish of a fresh site has no
 *  allergen line: there is no dish to name allergens for. */
const { lunch, days } = useLunch()
const { t, format, language } = useI18n('menu')
const langOf = useGinkoLang()
// Index of today; at the weekend (the coming week) there is none, so nothing is hidden.
const first = computed(() => Math.max(0, days.value.findIndex((day) => day.today)))
</script>

<template>
  <ol class="flex flex-col border-t">
    <li
      v-for="(day, index) in days"
      :key="day._id"
      :aria-current="day.today ? 'date' : undefined"
      :class="index < first && 'not-print:hidden'"
      class="grid gap-x-6 gap-y-1 border-b px-3 py-4 break-inside-avoid aria-[current=date]:bg-muted sm:grid-cols-[11rem_1fr_auto] sm:items-baseline print:aria-[current=date]:bg-transparent"
    >
      <p class="text-small text-muted-foreground tabular-nums">
        <span :class="day.today && 'font-semibold text-foreground'">{{ format.date(day.date, { weekday: 'long', day: 'numeric', month: 'long' }) }}</span>
        <span v-if="day.today" class="ms-2 print:hidden">{{ t('lunch.today') }}</span>
      </p>
      <template v-if="day.closed">
        <p class="text-muted-foreground">{{ t('lunch.closed') }}<template v-if="day.reason"> · {{ day.reason }}</template></p>
      </template>
      <template v-else>
        <div class="flex flex-col gap-1.5">
          <p class="font-medium" :lang="langOf(lunch, `days.${day._id}.dish`)">{{ day.dish }}</p>
          <MenuAllergens v-if="!isLunchPlaceholder(day.dish)" :codes="day.allergens.map(String)" />
        </div>
        <p v-if="day.price" class="tabular-nums sm:text-end">{{ formatMoney(day.price, language) }}</p>
      </template>
    </li>
  </ol>
</template>
