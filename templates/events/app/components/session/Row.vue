<!-- Synced from templates/_features/sessions/app/components/session/Row.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { MapPin } from '@lucide/vue'

/**
 * One session: start and end time (with the day when `day` is set), title, its summary (`summary: false` leaves it
 * out, as in the short "now and next" list), room, speakers linked to their pages, and its state as a word ("Sold
 * out", "Cancelled"; nothing while it takes place). Every value comes from the session's entry (useSessions).
 * `heading`: the level of the title under the list's own heading. `self`: the person whose page this is, named
 * without a link. `clock`: on the programme during the event, "now" (a word, and `aria-current="time"`) or "past"
 * (muted).
 */
withDefaults(defineProps<{
  session: SessionEntry
  day?: boolean
  heading?: 'h3' | 'h4'
  summary?: boolean
  self?: string
  clock?: 'now' | 'past'
}>(), { heading: 'h3', summary: true })
const { time, status, shortDay } = useSessionText()
const { t } = useI18n('sessions')
</script>

<template>
  <div
    class="grid break-inside-avoid gap-x-8 gap-y-1 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]"
    :class="clock === 'past' && 'text-muted-foreground'"
    :aria-current="clock === 'now' ? 'time' : undefined"
    :data-session="session.id"
    :data-session-clock="clock"
  >
    <p class="text-small text-muted-foreground tabular-nums sm:pt-0.5 sm:text-body sm:font-medium" :class="clock !== 'past' && 'sm:text-foreground'">
      <span v-if="day" class="block">{{ shortDay(session.date) }}</span>
      <time :datetime="`${session.date}T${session.from}`" data-session-time>{{ time(session) }}</time>
      <span v-if="clock === 'now'" class="block text-small font-semibold text-primary" data-session-now>{{ t('nowNext.now') }}</span>
    </p>
    <div class="flex min-w-0 flex-col gap-1">
      <component :is="heading" class="text-body font-semibold text-balance">{{ session.title }}</component>
      <p v-if="summary && session.summary" class="max-w-prose text-small text-muted-foreground">{{ session.summary }}</p>
      <p v-if="status(session)" class="text-small font-semibold" data-session-status>{{ status(session) }}</p>
      <p v-if="session.room || session.speakers.length" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground">
        <span v-if="session.room" class="inline-flex items-center gap-1.5" data-session-room>
          <MapPin class="size-3.5 shrink-0" aria-hidden="true" />{{ session.room }}
        </span>
        <span v-if="session.speakers.length">
          <template v-for="(speaker, i) in session.speakers" :key="speaker.id">
            <template v-if="i">, </template>
            <!-- Padding on an inline link widens its touch area to 44 px without moving the line. -->
            <NuxtLink
              v-if="speaker.to && speaker.id !== self"
              :to="speaker.to"
              class="font-medium text-foreground underline underline-offset-4 hover:text-primary pointer-coarse:py-3"
            >{{ speaker.name }}</NuxtLink>
            <span v-else>{{ speaker.name }}</span>
          </template>
        </span>
      </p>
    </div>
  </div>
</template>
