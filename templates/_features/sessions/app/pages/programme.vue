<script setup lang="ts">
// The programme: every session still to come, by day, with time, room, speakers and state (content/sessions/). A
// session leaves the page after its day. Event JSON-LD with each session as a subEvent, in the site's time zone. The
// address per language comes from `pages.programme` in ginko.config.ts.
const rows = useSessions()
const { t } = useI18n('sessions')
const { day } = useSessionText()
const days = computed(() => byDay(rows.value).map((group) => group.date))
const jsonLd = useProgrammeJsonLd(() => rows.value)
usePageSeo(() => ({ title: t('programme.title'), description: t('programme.lead'), jsonLd: jsonLd.value }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('programme.title')" :lead="t('programme.lead')">
      <nav v-if="days.length > 1" :aria-label="t('programme.days')" class="flex flex-wrap gap-x-6">
        <a v-for="date in days" :key="date" :href="`#day-${date}`" class="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 tabular-nums">{{ day(date) }}</a>
      </nav>
    </BlockPageHeader>
    <div class="mx-auto max-w-page px-gutter">
      <SessionProgramme v-if="rows.length" :rows="rows" :level="2" />
      <BlockEmpty v-else :title="t('programme.empty')" path="content/sessions/" />
    </div>
  </div>
</template>
