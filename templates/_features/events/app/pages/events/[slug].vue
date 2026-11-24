<script setup lang="ts">
import type { Component, ComputedRef } from 'vue'
import { safeHref } from '@lupinum/ginko'
import type { SessionJsonLdInput } from '@lupinum/ginko/patterns'
import { ArrowLeft } from '@lucide/vue'

// One event: date with weekday and time (site time zone), place (its location, else the online link, else the
// site's name and address when app.config `events.atTheBusiness` is true; otherwise no row: content/site.md is the organiser, not the venue), price, the description, and how to take part: the
// booking link until `bookingUntil`, else phone and email of the business (content/site.md); "fully booked" or
// "booking has closed" replaces both. Event JSON-LD with the time zone offset. An unknown or past event is a 404.
// A feature may show more after the description with app/components/event/Programme.vue (prop `id`: the event's
// entry id), and give the event's sessions to its JSON-LD with `useSessionsLd` in app/composables/useSessions.ts;
// the sessions feature brings both: the event's programme. Without those files, nothing is added.
// A template may bring app/components/event/Header.vue (prop `event`: the event entry): it replaces the back link,
// title, facts and photo (for example a photo opening); `EventActions` (booking, "fully booked", phone and email) then
// follows it.
const EventHeader = Object.values(import.meta.glob<Component>('../../components/event/Header.vue', { eager: true, import: 'default' }))[0]
const EventProgramme = Object.values(import.meta.glob<Component>('../../components/event/Programme.vue', { eager: true, import: 'default' }))[0]
type SessionsLd = (event: () => string) => ComputedRef<SessionJsonLdInput[]>
const useSessionsLd = Object.values(import.meta.glob<SessionsLd>('../../composables/useSessions.ts', { eager: true, import: 'useSessionsLd' }))[0]
const route = useRoute()
const event = useGinkoEntry('events', () => route.params.slug)
const { t } = useI18n('events')
const { dates, times, price } = useEventText()
const venue = useEventVenue()
const path = useGinkoPath()
const langOf = useGinkoLang()
const description = await useGinkoMarkdown(() => event.value.data.description)
const sessions = useSessionsLd?.(() => event.value.id)
const jsonLd = useEventJsonLd(() => ({ ...event.value.data, url: event.value.url ?? route.path }), () => description.value, () => sessions?.value)
// The meta description is plain text: the isolate marks of a right-to-left page stay out of it.
const metaDescription = () => `${dates(event.value.data)}${times(event.value.data) ? `, ${times(event.value.data)}` : ''}`.replace(/[\u2066\u2069]/g, '')
usePageSeo(() => ({ title: event.value.data.title, description: metaDescription(), image: event.value.data.image ?? undefined, jsonLd: [jsonLd.value] }))

const online = computed(() => safeHref(event.value.data.online ?? undefined))
const atBusiness = computed(() => (event.value.data.location || online.value ? undefined : venue(event.value.data)))
const place = computed(() => event.value.data.location || (online.value ? t('online') : atBusiness.value?.name))
const businessAddress = computed(() => {
  const a = atBusiness.value?.address
  return a && [a.street, [a.postalCode, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
})
</script>

<template>
  <article>
    <template v-if="EventHeader">
      <component :is="EventHeader" :event="event" />
      <div class="mx-auto flex max-w-page flex-col px-gutter pb-8 md:pb-12">
        <EventActions :event="event" />
      </div>
    </template>
    <template v-else>
      <div class="mx-auto max-w-page px-gutter pt-8 md:pt-12">
        <NuxtLink :to="path('events')" class="-ms-1 inline-flex min-h-11 items-center gap-2 px-1 text-small font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          <ArrowLeft class="size-4 rtl:-scale-x-100" aria-hidden="true" />
          {{ t('all') }}
        </NuxtLink>
      </div>
      <header class="mx-auto max-w-page px-gutter pt-4 pb-8 md:pb-12">
        <div class="flex max-w-3xl flex-col gap-5">
          <h1 class="text-h1" :lang="langOf(event, 'title')">{{ event.data.title }}</h1>
          <dl class="grid gap-x-8 gap-y-3 sm:grid-cols-[auto_1fr]">
            <dt class="text-small text-muted-foreground">{{ t('date') }}</dt>
            <dd class="font-medium tabular-nums">{{ dates(event.data) }}</dd>
            <template v-if="times(event.data)">
              <dt class="text-small text-muted-foreground">{{ t('time') }}</dt>
              <dd class="font-medium tabular-nums">{{ times(event.data) }}</dd>
            </template>
            <template v-if="place">
              <dt class="text-small text-muted-foreground">{{ t('place') }}</dt>
              <dd class="font-medium">
                <a v-if="!event.data.location && online" :href="online" rel="noopener" class="text-primary underline">{{ place }}</a>
                <span v-else>{{ place }}</span>
                <span v-if="businessAddress" class="block font-normal text-muted-foreground">{{ businessAddress }}</span>
              </dd>
            </template>
            <template v-if="price(event.data)">
              <dt class="text-small text-muted-foreground">{{ t('price') }}</dt>
              <dd class="font-medium tabular-nums">{{ price(event.data) }}</dd>
            </template>
          </dl>
          <EventActions :event="event" />
        </div>
      </header>
      <div v-if="event.data.image" class="mx-auto max-w-page px-gutter pb-10">
        <GinkoImage :image="event.data.image" eager sizes="(min-width: 1216px) 1152px, 100vw" class="aspect-video w-full rounded-block bg-muted object-cover" :lang="langOf(event, 'image.alt')" />
      </div>
    </template>
    <div :lang="langOf(event, 'description')">
      <ProseBody :value="event.data.description" />
    </div>
    <component :is="EventProgramme" v-if="EventProgramme" :id="event.id" />
  </article>
</template>
