<!-- One area card of Today: the brick's heading (with "Fällig" beside it, never inside, so the heading keeps its
     name), its lede and section, then one sub-section per plan brick that plans it (lunchPlans in Mittagsmenü).
     An open day's hours card is tinted (the green surface says "for your information") and shows the times large. -->
<script setup lang="ts">
import { computed, inject } from 'vue'
import { CircleAlertIcon } from '@lucide/vue'
import { Badge } from '@studio/components/ui/badge'
import type { Card, View } from '../../composables/useTodayAreas'
import { shownLabel } from '../../utils/labels'
import GinkoMark from '../GinkoMark.vue'
import TodayArea from './TodayArea.vue'
import { TODAY } from './context'

const props = defineProps<{
  card: Card
  views: Record<string, View>
  ownLine: (p: View['waiting'][number]) => string
  ownWhen: (at: number) => string
}>()
const { t } = useI18n()
const ctx = inject(TODAY)!
/** Open today, and nothing entered against it ("Heute geschlossen" has its own warning box). */
const tinted = computed(() => {
  const view = props.views[props.card.key]!
  return !!view.status?.open && !view.flag && !view.due
})
</script>

<template>
  <section
    :aria-labelledby="`b-${card.key}`"
    data-card
    :data-tint="tinted ? '' : undefined"
    class="group/card relative isolate flex min-w-0 scroll-mt-20 flex-col gap-3 rounded-[14px] border bg-card p-4 @[680px]:p-[18px] data-[flash]:ring-2 data-[flash]:ring-ring/50 data-[tint]:overflow-hidden data-[tint]:rounded-bl-[4px] data-[tint]:border-transparent data-[tint]:bg-accent"
  >
    <GinkoMark v-if="tinted" class="pointer-events-none absolute -right-[46px] -bottom-[60px] -z-10 size-[210px] text-accent-foreground/10" />
    <div class="flex items-start gap-2">
      <h2 :id="`b-${card.key}`" tabindex="-1" class="min-w-0 text-base leading-6 font-semibold outline-none">{{ shownLabel(card.main.brick.label, ctx.main) }}</h2>
      <Badge v-if="views[card.key]!.due" variant="warning" class="mt-0.5"><CircleAlertIcon aria-hidden="true" />{{ t('today.due.badge') }}</Badge>
    </div>
    <p v-if="card.main.brick.describe" class="-mt-2.5 truncate text-[13px] leading-[1.45] text-muted-foreground" data-test="lede">{{ shownLabel(card.main.brick.describe, ctx.main) }}</p>
    <TodayArea :sec="card.main" :view="views[card.key]!" :plan="false" :tinted="tinted" :own-line="ownLine" :own-when="ownWhen" />

    <section v-for="p in card.plans" :key="p.key" :aria-labelledby="`b-${p.key}`" class="grid scroll-mt-20 gap-2 border-t pt-3 group-data-[tint]/card:border-accent-foreground/15">
      <div class="flex items-start gap-2">
        <h3 :id="`b-${p.key}`" tabindex="-1" class="min-w-0 text-[13px] leading-5 font-medium text-muted-foreground outline-none">{{ shownLabel(p.brick.label, ctx.main) }}</h3>
        <Badge v-if="views[p.key]!.due" variant="warning"><CircleAlertIcon aria-hidden="true" />{{ t('today.due.badge') }}</Badge>
      </div>
      <TodayArea :sec="p" :view="views[p.key]!" :plan="true" :owner-due="views[card.key]!.due" :own-line="ownLine" :own-when="ownWhen" />
    </section>
  </section>
</template>
