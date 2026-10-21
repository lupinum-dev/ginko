<!-- One area card of Today: the brick's heading (with "Fällig" beside it, never inside, so the heading keeps its
     name), its lede and section, then one sub-section per plan brick that plans it (lunchPlans in Mittagsmenü). -->
<script setup lang="ts">
import { inject } from 'vue'
import { CircleAlertIcon } from '@lucide/vue'
import { Badge } from '@studio/components/ui/badge'
import type { Card, View } from '../../composables/useTodayAreas'
import { shownLabel } from '../../utils/labels'
import TodayArea from './TodayArea.vue'
import { TODAY } from './context'

defineProps<{
  card: Card
  views: Record<string, View>
  ownLine: (p: View['waiting'][number]) => string
  ownWhen: (at: number) => string
}>()
const { t } = useI18n()
const ctx = inject(TODAY)!
</script>

<template>
  <section
    :aria-labelledby="`b-${card.key}`"
    data-card
    class="flex min-w-0 scroll-mt-20 flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 data-[flash]:ring-2 data-[flash]:ring-ring/50 dark:border-border/50"
  >
    <div class="flex items-start gap-2">
      <h2 :id="`b-${card.key}`" tabindex="-1" class="min-w-0 text-[15px] leading-6 font-semibold outline-none">{{ shownLabel(card.main.brick.label, ctx.main) }}</h2>
      <Badge v-if="views[card.key]!.due" variant="warning" class="mt-0.5"><CircleAlertIcon aria-hidden="true" />{{ t('today.due.badge') }}</Badge>
    </div>
    <p v-if="card.main.brick.describe" class="-mt-2 truncate text-[13px] text-muted-foreground" data-test="lede">{{ shownLabel(card.main.brick.describe, ctx.main) }}</p>
    <TodayArea :sec="card.main" :view="views[card.key]!" :plan="false" :own-line="ownLine" :own-when="ownWhen" />

    <section v-for="p in card.plans" :key="p.key" :aria-labelledby="`b-${p.key}`" class="grid scroll-mt-20 gap-2 border-t border-border/60 pt-3">
      <div class="flex items-start gap-2">
        <h3 :id="`b-${p.key}`" tabindex="-1" class="min-w-0 text-[13px] leading-5 font-medium text-muted-foreground outline-none">{{ shownLabel(p.brick.label, ctx.main) }}</h3>
        <Badge v-if="views[p.key]!.due" variant="warning"><CircleAlertIcon aria-hidden="true" />{{ t('today.due.badge') }}</Badge>
      </div>
      <TodayArea :sec="p" :view="views[p.key]!" :plan="true" :own-line="ownLine" :own-when="ownWhen" />
    </section>
  </section>
</template>
