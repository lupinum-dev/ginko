<script setup lang="ts">
// The next date of content/events/: its title, the day with the weekday, the time and the place. Events leave the
// site after their last day, so the first one is the next. Renders nothing when no date is planned. Shown in the
// closing band of the home page and at the top of the Get involved page; the title links to the event's page.
const events = useGinko('events')
const { t } = useI18n()
const { dates, times } = useEventText()
const next = computed(() => events.value.items[0])
</script>

<template>
  <div v-if="next" class="flex flex-col gap-1">
    <p class="text-small font-medium text-muted-foreground">{{ t('event.next') }}</p>
    <p class="font-semibold">
      <NuxtLink v-if="next.url" :to="next.url" class="underline underline-offset-4 hover:decoration-2">{{ next.data.title }}</NuxtLink>
      <template v-else>{{ next.data.title }}</template>
    </p>
    <p class="tabular-nums">
      <time :datetime="next.data.when.from">{{ dates(next.data) }}</time><template v-if="times(next.data)">{{ t('event.separator') }}<bdi>{{ times(next.data) }}</bdi></template>
    </p>
    <p v-if="next.data.location"><bdi>{{ next.data.location }}</bdi></p>
  </div>
</template>
