<!-- Synced from templates/_features/sessions/app/components/session/NowNext.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

/**
 * "Now and next" on an event day: the sessions running now and the ones that start next, with time, room and state,
 * from the same rows as the programme. The clock is the server's at render time, so the page and the browser agree;
 * after that it moves on every minute. On a day without sessions it shows nothing.
 */
const rows = useSessions()
const { at, tick } = useSessionClock()
const { t } = useI18n('sessions')
const path = useGinkoPath()
onMounted(tick)
const state = computed(() => nowAndNext(rows.value, at.value.date, at.value.clock))
</script>

<template>
  <BlockSection v-if="state.day" :title="t('nowNext.title')" :lead="t('nowNext.at', { time: at.clock })" data-now-next>
    <div class="flex flex-col gap-8">
      <div class="grid gap-8 md:grid-cols-2 md:gap-12">
        <div class="flex flex-col" data-now>
          <h3 class="text-small font-semibold text-muted-foreground">{{ t('nowNext.now') }}</h3>
          <ul v-if="state.now.length" class="flex flex-col divide-y">
            <li v-for="session in state.now" :key="session.id">
              <SessionRow :session="session" heading="h4" />
            </li>
          </ul>
          <p v-else class="py-5">{{ state.over ? t('nowNext.over') : t('nowNext.nothing') }}</p>
        </div>
        <div v-if="state.next.length" class="flex flex-col" data-next>
          <h3 class="text-small font-semibold text-muted-foreground tabular-nums">{{ t('nowNext.next', { time: state.next[0]!.from }) }}</h3>
          <ul class="flex flex-col divide-y">
            <li v-for="session in state.next" :key="session.id">
              <SessionRow :session="session" heading="h4" />
            </li>
          </ul>
        </div>
      </div>
      <NuxtLink :to="path('programme')" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline">
        {{ t('programme.all') }}
        <ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </div>
  </BlockSection>
</template>
