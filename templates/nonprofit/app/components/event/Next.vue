<script setup lang="ts">
// The next date of content/events/: its title, the day with the weekday, the time and the place. Events leave the
// site after their last day, so the first one is the next. Renders nothing when no date is planned. Shown in the
// closing band of the home page and at the top of the Get involved page; the title links to the event's page.
const events = useGinko('events')
const { t, format } = useI18n()
const next = computed(() => events.value.items[0])
const day = computed(() => next.value && format.range(next.value.data.when.from, next.value.data.when.to, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
const time = computed(() => {
  const data = next.value?.data
  if (!data?.start) return undefined
  return data.end ? t('event.time', { start: data.start, end: data.end }) : data.start
})
</script>

<template>
  <div v-if="next" class="flex flex-col gap-1">
    <p class="text-small font-medium text-muted-foreground">{{ t('event.next') }}</p>
    <p class="font-semibold">
      <NuxtLink :to="next.url ?? ''" class="underline underline-offset-4 hover:decoration-2">{{ next.data.title }}</NuxtLink>
    </p>
    <p class="tabular-nums">
      <time :datetime="next.data.when.from">{{ day }}</time><template v-if="time">{{ t('event.separator') }}<bdi dir="ltr">{{ time }}</bdi></template>
    </p>
    <p v-if="next.data.location"><bdi>{{ next.data.location }}</bdi></p>
  </div>
</template>
