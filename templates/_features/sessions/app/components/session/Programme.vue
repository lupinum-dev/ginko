<script setup lang="ts">
/**
 * Sessions by day: a heading per day (weekday and date) and its sessions in order of their start time. `level`: the
 * heading level of the days (2 on the programme page, 3 under a section's h2); the sessions' titles are one below.
 * Each day has an id (`day-2026-11-19`) for the day links at the top of the programme page.
 */
const props = withDefaults(defineProps<{ rows: SessionRow[], level?: 2 | 3 }>(), { level: 2 })
const { day } = useSessionText()
const days = computed(() => byDay(props.rows))
</script>

<template>
  <div class="flex flex-col gap-12">
    <section v-for="group in days" :id="`day-${group.date}`" :key="group.date" :aria-labelledby="`day-${group.date}-title`" class="scroll-mt-6">
      <component :is="`h${level}`" :id="`day-${group.date}-title`" class="text-h3 tabular-nums">{{ day(group.date) }}</component>
      <ul class="mt-4 flex flex-col divide-y border-y">
        <li v-for="session in group.sessions" :key="session.id">
          <SessionRow :session="session" :heading="level === 2 ? 'h3' : 'h4'" />
        </li>
      </ul>
    </section>
  </div>
</template>
