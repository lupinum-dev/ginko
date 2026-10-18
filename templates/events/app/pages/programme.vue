<!-- Synced from templates/_features/sessions/app/pages/programme.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
// The programme: every session still to come, by day, with time, room, speakers and state (content/sessions/). A
// session leaves the page after its day. During an event day a link jumps to what is on now. While tickets are on
// sale, the ticket link of the event is this page's one main action. The Event JSON-LD with each session is on the
// event's own page (useSessionsLd). The address per language comes from `pages.programme` in ginko.config.ts.
const rows = useSessions()
const events = useGinko('events')
const { t } = useI18n('sessions')
const { shortDay } = useSessionText()
const { at } = useSessionClock()
const booking = useEventBooking()
const days = computed(() => byDay(rows.value).map((group) => group.date))
// The session to jump to on an event day: the first one that has not ended (cancelled ones do not count).
const current = computed(() => rows.value.find((row) => row.date === at.value.date && row.to > at.value.clock && row.status !== 'cancelled'))
// The event of the programme (the first one with sessions) and its ticket link while booking is open.
const tickets = computed(() => {
  const event = events.value.items.find((item) => rows.value.some((row) => row.event === item.id))
  return event ? booking(event.data) : undefined
})
usePageSeo(() => ({ title: t('programme.title'), description: t('programme.lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('programme.title')" :lead="t('programme.lead')">
      <div v-if="tickets || days.length > 1 || current" class="flex flex-col gap-4 print:hidden">
        <Button v-if="tickets" as-child size="lg" class="self-start max-sm:w-full">
          <a :href="tickets" rel="noopener">{{ t('programme.tickets') }}</a>
        </Button>
        <nav v-if="days.length > 1 || current" :aria-label="t('programme.days')" class="flex flex-wrap gap-2">
          <a v-if="current" :href="`#session-${current.id.replace('/', '-')}`" class="inline-flex min-h-11 items-center rounded-full border border-primary bg-primary px-4 font-medium text-primary-foreground" data-jump-now>{{ t('programme.now') }}</a>
          <a v-for="date in days" :key="date" :href="`#day-${date}`" class="inline-flex min-h-11 items-center rounded-full border px-4 font-medium tabular-nums hover:bg-accent">{{ shortDay(date) }}</a>
        </nav>
      </div>
    </BlockPageHeader>
    <div class="mx-auto max-w-page px-gutter">
      <SessionProgramme v-if="rows.length" :rows="rows" :level="2" />
      <BlockEmpty v-else :title="t('programme.empty')" path="content/sessions/" />
    </div>
  </div>
</template>
