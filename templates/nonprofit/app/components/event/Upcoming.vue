<!-- Synced from templates/_features/events/app/components/event/Upcoming.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

/** The next events as a section of another page (the home page): up to `limit` cards and a link to all. Nothing
 *  when no event is coming up, so a quiet month leaves no empty box on the home page. `skip` leaves out the first
 *  events, for a page that already shows the next one on its own (the nonprofit's Get involved). */
const props = withDefaults(defineProps<{ title?: string, limit?: number, skip?: number }>(), { limit: 3, skip: 0 })
const upcoming = useUpcomingEvents(() => props.skip + props.limit)
const cards = computed(() => upcoming.value.slice(props.skip))
const { t } = useI18n('events')
const path = useGinkoPath()
</script>

<template>
  <BlockSection v-if="cards.length" :title="title ?? t('upcoming')" :side="false">
    <div class="flex flex-col gap-6">
      <BlockCards :items="cards" :columns="3" />
      <NuxtLink :to="path('events')" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline">
        {{ t('all') }}
        <ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </div>
  </BlockSection>
</template>
