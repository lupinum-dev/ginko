<!-- Synced from templates/_features/pricing/app/components/pricing/Plans.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { Check } from '@lucide/vue'
import type { Plan } from '~/composables/usePricing'

/**
 * The plans side by side from `md` (two to three per row, four from `lg`), stacked on phones. Each plan: its name,
 * with the word "Recommended" next to it on the recommended one (its border takes the accent too, never the colour
 * alone), for whom, the price per month and, below it, the price per year (or "On request"), the action, and what is
 * included. Side by side, these four parts share rows (CSS subgrid), so prices and buttons line up across the plans.
 * The recommended plan's button is the page's main action; the others are outlined. Prices in tabular numbers; both
 * intervals are written out, so the table needs no switch and no script.
 */
const props = withDefaults(defineProps<{ plans: Plan[], headingLevel?: 'h2' | 'h3' }>(), { headingLevel: 'h2' })
const { t } = useI18n('pricing')
const columns = computed(() => (props.plans.length >= 4 ? 'md:grid-cols-2 lg:grid-cols-4' : props.plans.length === 3 ? 'md:grid-cols-3' : props.plans.length === 2 ? 'md:grid-cols-2' : ''))
</script>

<template>
  <ul class="grid gap-6" :class="columns">
    <li
      v-for="plan in plans"
      :key="plan.id"
      :data-plan="plan.id"
      class="flex flex-col gap-6 rounded-block border p-6 md:row-span-4 md:grid md:grid-rows-subgrid lg:p-8"
      :class="plan.recommended && 'border-primary'"
    >
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <component :is="headingLevel" class="text-h3 font-semibold">{{ plan.name }}</component>
          <p v-if="plan.recommended" class="text-small font-semibold text-primary" data-recommended>{{ t('recommended') }}</p>
        </div>
        <p class="text-muted-foreground">{{ plan.summary }}</p>
      </div>
      <div v-if="plan.prices" class="flex flex-col gap-1" data-prices>
        <p class="flex flex-wrap items-baseline gap-x-2">
          <span class="text-h2 font-semibold tabular-nums" data-monthly>{{ plan.prices.monthly }}</span>
          <span class="text-muted-foreground">{{ t('perMonth') }}</span>
        </p>
        <p class="text-small text-muted-foreground tabular-nums" data-yearly>{{ t('orYearly', { price: plan.prices.yearly }) }}</p>
      </div>
      <p v-else class="text-h3 font-semibold" data-on-request>{{ t('onRequest') }}</p>
      <Button v-if="plan.action.href" as-child size="lg" :variant="plan.recommended ? 'default' : 'outline'" class="h-auto min-h-12 w-full py-3 text-center whitespace-normal">
        <a :href="plan.action.href">{{ plan.action.label }}</a>
      </Button>
      <div v-if="plan.included.length" class="flex flex-col gap-3 border-t pt-6">
        <p class="text-small font-medium">{{ t('included') }}</p>
        <ul class="flex flex-col gap-3">
          <li v-for="item in plan.included" :key="item" class="flex gap-3">
            <Check class="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{{ item }}</span>
          </li>
        </ul>
      </div>
    </li>
  </ul>
</template>
