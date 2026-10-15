<script setup lang="ts">
/**
 * The answer to "are you open?": open now and until when, opening later today, or closed today with the owner's
 * reason or the public holiday, then today's times or the next opening. The state is a word, the dot only repeats it.
 * The clock moves on every minute, so a page left open stays true. `small`: in small text, for the footer.
 */
defineProps<{ small?: boolean }>()
const { state, todayRule, nextOpen, now } = useHours()
const { t, format, locale } = useI18n('hours')

onMounted(() => {
  now.value = Date.now()
  const timer = setInterval(() => (now.value = Date.now()), 60_000)
  onBeforeUnmount(() => clearInterval(timer))
})

const open = computed(() => state.value.kind === 'open')
const headline = computed(() => {
  const s = state.value
  if (s.kind === 'open') return t('now.open')
  if (s.kind === 'later') return s.again ? t('now.again', { time: s.at }) : t('now.later', { time: s.at })
  if (s.kind === 'over') return t('now.over')
  if (s.kind === 'closed') return t('now.closed')
  return t('now.unknown')
})
const detail = computed(() => {
  const s = state.value
  if (s.kind === 'open') return t('now.until', { time: s.until })
  if (s.kind !== 'closed') return undefined
  if (s.holiday) return locale.value === 'de' || locale.value === 'en' ? s.holiday[locale.value] : t('holiday')
  return s.reason
})
// Today's spans while they still matter; once the day is over or closed, the next opening instead.
const times = computed(() => (state.value.kind === 'open' || state.value.kind === 'later') && todayRule.value.times.length
  ? t('todayTimes', { times: spansLine(todayRule.value.times, t('and')) })
  : undefined)
const next = computed(() => (state.value.kind === 'over' || state.value.kind === 'closed') && nextOpen.value
  ? t('now.next', { day: format.date(nextOpen.value.date, { weekday: 'long', day: 'numeric', month: 'long' }), time: nextOpen.value.from })
  : undefined)
</script>

<template>
  <div class="flex flex-col gap-1" data-hours-now>
    <p class="flex flex-wrap items-center gap-x-2 tabular-nums" :class="small ? 'text-small' : 'text-body'">
      <span class="inline-flex items-center gap-2 font-semibold">
        <span class="size-2.5 shrink-0 rounded-full" :class="open ? 'bg-success' : 'bg-muted-foreground'" aria-hidden="true" />
        {{ headline }}
      </span>
      <span v-if="detail" class="text-muted-foreground">{{ detail }}</span>
    </p>
    <p v-if="times || next" class="ps-4.5 text-small text-muted-foreground tabular-nums">{{ times ?? next }}</p>
  </div>
</template>
