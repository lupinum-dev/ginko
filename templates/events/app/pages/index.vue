<script setup lang="ts">
import { ArrowRight, CalendarDays, MapPin } from '@lucide/vue'

// The home page answers "when, where, and how do I get in?" on the first screen: the dates and the place of the next
// event (content/events/, the first one that has sessions) with a link to the map, the ticket link (a ticket shop on
// another website: no payment on this site) while sales are open, and the programme. On the event days the first
// screen is for "what is on now": the hero drops its lead and photo, "now and next" follows it, and the programme is
// the main action. Then a few sessions, speakers, sponsors, three questions, last year's photos and, while tickets
// are on sale, a closing band with the price. A section whose list is empty is left out.
const home = useGinko('home')
const events = useGinko('events')
const people = useGinko('people')
const logos = useGinko('logos')
const questions = useGinko('faq')
const gallery = useGinko('gallery')
const rows = useSessions()
const { state } = useNowAndNext()
const { dates, price } = useEventText()
const booking = useEventBooking()
const closedOf = useBookingClosed()
const { t } = useI18n()
const path = useGinkoPath()
const links = useSiteLinks(() => [{ entry: 'pages/sponsoring' }, { entry: 'pages/venue' }])
const link = (key: string) => links.value.find((l) => l.key === key)

// The conference: the next event with a programme, else the next event at all.
const event = computed(() => events.value.items.find((item) => rows.value.some((row) => row.event === item.id)) ?? events.value.items[0])
const tickets = computed(() => {
  const href = event.value && booking(event.value.data)
  return href ? { label: t('home.tickets'), to: href } : undefined
})
const closed = computed(() => (event.value ? closedOf(event.value.data) : false))
const programme = computed(() => ({ label: t('home.programme'), to: path('programme') }))
// Without tickets (sales closed, fully booked, on the event days) the programme is the main action and the venue the
// second one.
const venue = computed(() => {
  const page = link('pages/venue')
  return page ? { label: page.label, to: page.to } : undefined
})
const onEventDay = computed(() => state.value.day)
// "Open in maps": a link to OpenStreetMap with the place, no embedded map (nothing loads from another company).
const maps = computed(() => (event.value?.data.location ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(event.value.data.location)}` : undefined))
// A few talks and workshops still to come: the sessions with a summary (not the breaks or the welcome), in programme
// order. On an event day they start after "next", so they do not repeat "now and next" (the same clock).
const { at } = useSessionClock()
const highlights = computed(() => {
  const after = state.value.next[0]?.from ?? at.value.clock
  return rows.value.filter((row) => row.summary && row.status !== 'cancelled' && (row.date > at.value.date || (row.date === at.value.date && row.from > after))).slice(0, 4)
})
usePageSeo(() => ({ home: true, title: t('home.title'), description: home.value.data.lead, image: home.value.data.image ?? undefined }))
</script>

<template>
  <div>
    <BlockHero
      :title="home.data.title"
      :lead="onEventDay ? undefined : home.data.lead"
      :primary="tickets ?? programme"
      :secondary="tickets ? programme : venue"
      :image="onEventDay ? undefined : home.data.image ?? undefined"
    >
      <template v-if="event" #status>
        <div class="flex flex-col gap-1" data-event-when>
          <p class="flex items-start gap-2 text-lead font-semibold tabular-nums">
            <CalendarDays class="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>{{ dates(event.data) }}</span>
          </p>
          <div v-if="event.data.location" class="flex items-start gap-2 text-muted-foreground">
            <MapPin class="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p class="flex flex-col items-start">
              <span>{{ event.data.location }}</span>
              <a v-if="maps" :href="maps" rel="noopener" class="inline-flex min-h-11 items-center font-medium whitespace-nowrap text-foreground underline underline-offset-4 hover:text-primary">{{ t('home.maps') }}</a>
            </p>
          </div>
        </div>
      </template>
      <p v-if="event?.data.soldOut" class="text-lead font-semibold">{{ t('events.soldOut') }}</p>
      <p v-else-if="closed && !onEventDay" class="text-lead font-semibold">{{ t('events.bookingClosed') }}</p>
    </BlockHero>

    <SessionNowNext />

    <BlockSection v-if="highlights.length" :title="t('home.highlights')" :side="false">
      <div class="flex flex-col gap-4">
        <ul class="flex flex-col divide-y border-y">
          <li v-for="session in highlights" :key="session.id">
            <SessionRow :session="session" day />
          </li>
        </ul>
        <NuxtLink v-if="!onEventDay" :to="path('programme')" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline">
          {{ t('sessions.programme.all') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </BlockSection>

    <BlockSection v-if="people.items.length" :title="t('home.speakers')" :side="false">
      <div class="flex flex-col gap-8">
        <SessionSpeakers :items="people.items.slice(0, 4)" />
        <NuxtLink :to="path('speakers')" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline">
          {{ t('sessions.speakers.all') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </BlockSection>

    <BlockSection v-if="logos.items.length" :title="t('home.sponsors')">
      <div class="flex flex-col gap-6">
        <BlockLogos :items="logos.items" />
        <NuxtLink v-if="link('pages/sponsoring')" :to="link('pages/sponsoring')!.to" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline">
          {{ t('home.sponsoring') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </BlockSection>

    <BlockSection v-if="questions.items.length" :title="t('home.questions')">
      <div class="flex flex-col gap-6">
        <BlockFaq :items="questions.items.slice(0, 3).map((item) => ({ id: item.id, question: item.data.question, answer: item.data.answer }))" />
        <NuxtLink :to="path('faq')" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline">
          {{ t('home.allQuestions') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </BlockSection>

    <BlockSection v-if="gallery.data.images.length" :title="t('home.lastYear')" :side="false">
      <BlockGallery :images="gallery.data.images.map((entry) => entry.image)" />
    </BlockSection>

    <BlockCta
      v-if="tickets && event"
      :title="t('home.ctaTitle')"
      :text="event.data.price?.amount === 0 ? t('home.ctaTextFree') : price(event.data) ? t('home.ctaText', { price: price(event.data)! }) : undefined"
      :action="tickets"
    />
  </div>
</template>
