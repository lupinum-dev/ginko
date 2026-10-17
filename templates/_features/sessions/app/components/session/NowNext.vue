<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

/**
 * "Now and next" on an event day: the sessions running now and the ones that start next, with time, room and state,
 * from the same rows as the programme; cancelled sessions are left out (the programme names them). Before the first
 * session it says when the programme starts; after the last one, when it continues. The clock is the server's at
 * render time, so the page and the browser agree; after that it moves on every minute. On a day without sessions it
 * shows nothing.
 */
const { state, at, tick } = useNowAndNext()
const { t } = useI18n('sessions')
const { day } = useSessionText()
const path = useGinkoPath()
onMounted(tick)
const empty = computed(() => {
  const { before, over, next, later } = state.value
  if (over) return later ? t('nowNext.later', { day: day(later.date), time: later.from }) : t('nowNext.over')
  return before && next[0] ? t('nowNext.before', { time: next[0].from }) : t('nowNext.nothing')
})
// After the day's last session the link leads to the next day of the programme.
const programme = computed(() => (state.value.later ? `${path('programme')}#day-${state.value.later.date}` : path('programme')))
</script>

<template>
  <BlockSection v-if="state.day" :title="t('nowNext.title')" :lead="t('nowNext.at', { time: at.clock })" :side="false" data-now-next>
    <div class="flex flex-col gap-8">
      <div class="grid gap-8 md:grid-cols-2 md:gap-12">
        <div class="flex flex-col" data-now>
          <h3 class="text-small font-semibold text-muted-foreground">{{ t('nowNext.now') }}</h3>
          <ul v-if="state.now.length" class="flex flex-col divide-y">
            <li v-for="session in state.now" :key="session.id">
              <SessionRow :session="session" heading="h4" :summary="false" />
            </li>
          </ul>
          <p v-else class="py-5">{{ empty }}</p>
        </div>
        <div v-if="state.next.length" class="flex flex-col" data-next>
          <h3 class="text-small font-semibold text-muted-foreground tabular-nums">{{ t('nowNext.next', { time: state.next[0]!.from }) }}</h3>
          <ul class="flex flex-col divide-y">
            <li v-for="session in state.next" :key="session.id">
              <SessionRow :session="session" heading="h4" :summary="false" />
            </li>
          </ul>
        </div>
      </div>
      <NuxtLink :to="programme" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline">
        {{ t('programme.all') }}
        <ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </div>
  </BlockSection>
</template>
