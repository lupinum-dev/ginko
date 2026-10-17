<script setup lang="ts">
import { formatMoney } from '@lupinum/ginko'

/** The lunch days of the week shown: weekday and date, the dish, its price and allergen letters. Today is marked in
 *  words; a day the place is closed says "Closed" instead of a dish. */
const { lunch, days } = useLunch()
const { t, format, language } = useI18n('menu')
const langOf = useGinkoLang()
</script>

<template>
  <ol class="flex flex-col border-t">
    <li
      v-for="day in days"
      :key="day._id"
      :aria-current="day.today ? 'date' : undefined"
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
          <MenuAllergens :codes="day.allergens.map(String)" />
        </div>
        <p v-if="day.price" class="tabular-nums sm:text-end">{{ formatMoney(day.price, language) }}</p>
      </template>
    </li>
  </ol>
</template>
