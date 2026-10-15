<script setup lang="ts">
import { MapPin } from '@lucide/vue'

/**
 * One session: start and end time (with the day when `day` is set), title, room, speakers linked to their pages,
 * and its state as a word ("Sold out", "Cancelled"; nothing while it takes place). Every value comes from the
 * session's entry (useSessions). `heading`: the level of the title under the list's own heading.
 */
withDefaults(defineProps<{ session: SessionRow, day?: boolean, heading?: 'h3' | 'h4' }>(), { heading: 'h3' })
const { time, status, shortDay } = useSessionText()
</script>

<template>
  <div class="grid gap-x-8 gap-y-1 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]" :data-session="session.id">
    <p class="text-small text-muted-foreground tabular-nums sm:pt-0.5 sm:text-body sm:font-medium sm:text-foreground">
      <span v-if="day" class="block">{{ shortDay(session.date) }}</span>
      <time :datetime="`${session.date}T${session.from}`" data-session-time>{{ time(session) }}</time>
    </p>
    <div class="flex min-w-0 flex-col gap-1">
      <component :is="heading" class="text-body font-semibold text-balance">{{ session.title }}</component>
      <p v-if="status(session)" class="text-small font-semibold" data-session-status>{{ status(session) }}</p>
      <p v-if="session.room || session.speakers.length" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground">
        <span v-if="session.room" class="inline-flex items-center gap-1.5" data-session-room>
          <MapPin class="size-3.5 shrink-0" aria-hidden="true" />{{ session.room }}
        </span>
        <span v-if="session.speakers.length">
          <template v-for="(speaker, i) in session.speakers" :key="speaker.id">
            <template v-if="i">, </template>
            <NuxtLink v-if="speaker.to" :to="speaker.to" class="font-medium text-foreground underline underline-offset-4 hover:text-primary">{{ speaker.name }}</NuxtLink>
            <span v-else>{{ speaker.name }}</span>
          </template>
        </span>
      </p>
    </div>
  </div>
</template>
