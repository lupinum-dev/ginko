<!-- Synced from templates/_features/events/app/pages/events/[slug].vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { Component, ComputedRef } from 'vue'
import { safeHref } from '@lupinum/ginko'
import type { SessionJsonLdInput } from '@lupinum/ginko/basics'
import { ArrowLeft, Mail, Phone } from '@lucide/vue'

// One event: date with weekday and time (site time zone), place, price, the description, and how to take part: the
// booking link until `bookingUntil`, else phone and email of the business (content/site.md); "fully booked" or
// "booking has closed" replaces both. Event JSON-LD with the time zone offset. An unknown or past event is a 404.
// A feature may show more after the description with app/components/event/Programme.vue (prop `id`: the event's
// entry id), and give the event's sessions to its JSON-LD with `useSessionsLd` in app/composables/useSessions.ts;
// the sessions feature brings both: the event's programme. Without those files, nothing is added.
const EventProgramme = Object.values(import.meta.glob<Component>('~/components/event/Programme.vue', { eager: true, import: 'default' }))[0]
type SessionsLd = (event: () => string) => ComputedRef<SessionJsonLdInput[]>
const useSessionsLd = Object.values(import.meta.glob<SessionsLd>('~/composables/useSessions.ts', { eager: true, import: 'useSessionsLd' }))[0]
const route = useRoute()
const event = useGinkoEntry('events', () => route.params.slug)
const site = useGinko('site')
const { name } = useGinkoSite()
const { t } = useI18n('events')
const { dates, times, price, ltr } = useEventText()
const path = useGinkoPath()
const langOf = useGinkoLang()
const description = await useGinkoMarkdown(() => event.value.data.description)
const sessions = useSessionsLd?.(() => event.value.id)
const jsonLd = useEventJsonLd(() => ({ ...event.value.data, url: event.value.url ?? route.path }), () => description.value, () => sessions?.value)
// The meta description is plain text: the isolate marks of a right-to-left page stay out of it.
const metaDescription = () => `${dates(event.value.data)}${times(event.value.data) ? `, ${times(event.value.data)}` : ''}`.replace(/[\u2066\u2069]/g, '')
usePageSeo(() => ({ title: event.value.data.title, description: metaDescription(), image: event.value.data.image ?? undefined, jsonLd: [jsonLd.value] }))

const contact = computed(() => site.value.data)
const bookingOf = useEventBooking()
const closedOf = useBookingClosed()
const booking = computed(() => bookingOf(event.value.data))
const closed = computed(() => closedOf(event.value.data))
const place = computed(() => event.value.data.location || (event.value.data.online ? t('online') : name))
</script>

<template>
  <article>
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
          <dt class="text-small text-muted-foreground">{{ t('place') }}</dt>
          <dd class="font-medium">
            <a v-if="!event.data.location && safeHref(event.data.online ?? undefined)" :href="safeHref(event.data.online ?? undefined)" rel="noopener" class="text-primary underline">{{ place }}</a>
            <span v-else>{{ place }}</span>
          </dd>
          <template v-if="price(event.data)">
            <dt class="text-small text-muted-foreground">{{ t('price') }}</dt>
            <dd class="font-medium tabular-nums">{{ price(event.data) }}</dd>
          </template>
        </dl>
        <p v-if="event.data.soldOut" class="text-lead font-semibold">{{ t('soldOut') }}</p>
        <p v-else-if="closed" class="text-lead font-semibold">{{ t('bookingClosed') }}</p>
        <div v-else-if="booking" class="flex flex-wrap gap-3">
          <Button as-child size="lg" class="max-sm:w-full">
            <a :href="booking" rel="noopener">{{ t('book') }}</a>
          </Button>
        </div>
        <div v-else-if="contact.phone || contact.email" class="flex flex-col gap-3">
          <p class="text-muted-foreground">{{ t('reserve') }}</p>
          <div class="flex flex-wrap gap-3">
            <Button v-if="contact.phone" as-child size="lg" class="max-sm:w-full">
              <a :href="telHref(contact.phone)"><Phone aria-hidden="true" />{{ t('call', { phone: ltr(contact.phone) }) }}</a>
            </Button>
            <Button v-if="contact.email" as-child size="lg" :variant="contact.phone ? 'outline' : 'default'" class="max-sm:w-full">
              <a :href="`mailto:${contact.email}`"><Mail aria-hidden="true" />{{ t('email') }}</a>
            </Button>
          </div>
        </div>
      </div>
    </header>
    <div v-if="event.data.image" class="mx-auto max-w-page px-gutter pb-10">
      <GinkoImage :image="event.data.image" eager sizes="(min-width: 1216px) 1152px, 100vw" class="aspect-video w-full rounded-block bg-muted object-cover" :lang="langOf(event, 'image.alt')" />
    </div>
    <div :lang="langOf(event, 'description')">
      <ProseBody :value="event.data.description" />
    </div>
    <component :is="EventProgramme" v-if="EventProgramme" :id="event.id" />
  </article>
</template>
