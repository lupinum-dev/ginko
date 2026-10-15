<script setup lang="ts">
/** The programme of one event on its page (the events feature shows this file after the description): its sessions
 *  by day, from the same rows as the programme page. Nothing when the event has no sessions. */
const props = defineProps<{ id: string }>()
const rows = useSessions()
const { t } = useI18n('sessions')
const own = computed(() => rows.value.filter((row) => row.event === props.id))
</script>

<template>
  <section v-if="own.length" aria-labelledby="event-programme" class="mx-auto max-w-page px-gutter pt-section">
    <h2 id="event-programme" class="text-h3">{{ t('programme.title') }}</h2>
    <SessionProgramme :rows="own" :level="3" class="mt-8" />
  </section>
</template>
