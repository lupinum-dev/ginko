<script setup lang="ts">
import { openingHoursJsonLd } from '@lupinum/ginko/basics'
import { Accessibility, ArrowRight, MapPin } from '@lucide/vue'

// The home page answers the first questions on the first screen: open today and until when, how to book (call, with
// the phone hours right under the button, or email; no form), where the practice is, and a photo of it. Below: the
// treatments with price and duration, the team, the address and access with the opening hours, and three questions.
// A section whose list is empty is left out.
const home = useGinko('home')
const people = useGinko('people')
const services = useGinko('services')
const questions = useGinko('faq')
const treatments = useServiceCards(() => 6)
const { visit, address, maps } = useVisit()
const { ctx, today } = useHours()
const { name } = useGinkoSite()
const { t } = useI18n()
const path = useGinkoPath()
const langOf = useGinkoLang()

const faqItems = computed(() => questions.value.items.slice(0, 3).map((item) => ({ id: item.id, question: item.data.question, answer: item.data.answer })))
const link = 'inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline'

// The practice for search engines: a Physiotherapy (a kind of LocalBusiness) with address and contact from
// content/site.md and the opening hours of the same rule as the page, closures and public holidays included. For
// another kind of business, change the type (schema.org: `HealthAndBeautyBusiness`, `Dentist`, `Store` …).
usePageSeo(() => ({
  home: true,
  title: t('home.title'),
  description: home.value.data.lead,
  image: home.value.data.image ?? undefined,
  organization: { '@type': 'Physiotherapy', ...openingHoursJsonLd(ctx.value, today.value) },
}))
</script>

<template>
  <div>
    <BlockHero :title="home.data.title" :lead="home.data.lead" :image="home.data.image ?? undefined">
      <template #status>
        <HoursToday />
      </template>
      <div class="mt-2 flex flex-col gap-4">
        <VisitBook />
        <p v-if="address.length" class="flex flex-wrap items-center gap-x-2 text-small text-muted-foreground">
          <MapPin class="size-4 shrink-0" aria-hidden="true" />
          <span><bdi>{{ address.join(', ') }}</bdi></span>
          <a v-if="maps" :href="maps" rel="noopener" class="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 hover:text-primary">{{ t('visit.maps') }}</a>
        </p>
      </div>
    </BlockHero>

    <BlockSection v-if="treatments.length" :title="t('home.prices')" :lead="t('home.pricesLead')" :side="false">
      <div class="flex flex-col gap-6">
        <BlockCards :items="treatments" compact />
        <NuxtLink v-if="services.items.length > treatments.length" :to="path('services')" :class="link">
          {{ t('home.allTreatments') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </BlockSection>

    <BlockSection v-if="people.items.length" :title="t('home.team')" :side="false">
      <div class="flex flex-col gap-6">
        <ul class="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <li v-for="person in people.items" :key="person.id" class="flex items-center gap-4">
            <GinkoImage v-if="person.data.photo" :image="person.data.photo" sizes="48px" class="size-12 shrink-0 rounded-full bg-muted object-cover" />
            <InitialsAvatar v-else :name="person.data.name" />
            <div class="flex min-w-0 flex-col">
              <h3 class="font-semibold">{{ person.data.name }}</h3>
              <p v-if="person.data.role" class="text-small text-muted-foreground">{{ person.data.role }}</p>
            </div>
          </li>
        </ul>
        <NuxtLink :to="path('team')" :class="link">
          {{ t('home.allTeam') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </BlockSection>

    <BlockSection id="visit" :title="t('home.visit')" :side="false">
      <div class="grid gap-12 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-24">
        <div class="flex flex-col gap-4">
          <h3 class="text-body font-semibold">{{ t('home.hours') }}</h3>
          <HoursTable :level="4" />
        </div>
        <div class="flex flex-col gap-4 max-md:order-first">
          <h3 class="text-body font-semibold">{{ t('home.address') }}</h3>
          <address v-if="address.length" class="flex flex-col not-italic">
            <span><bdi>{{ name }}</bdi></span>
            <span v-for="line in address" :key="line"><bdi>{{ line }}</bdi></span>
          </address>
          <a v-if="maps" :href="maps" rel="noopener" :class="link">
            <MapPin class="size-4 shrink-0" aria-hidden="true" />{{ t('visit.maps') }}
          </a>
          <p v-if="visit.data.access" class="flex gap-3 text-muted-foreground" :lang="langOf(visit, 'access')">
            <Accessibility class="mt-1 size-4 shrink-0" aria-hidden="true" />{{ visit.data.access }}
          </p>
          <NuxtLink :to="path('contact')" :class="link">
            {{ t('home.directions') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </NuxtLink>
        </div>
      </div>
    </BlockSection>

    <BlockSection v-if="faqItems.length" :title="t('home.questions')">
      <div class="flex flex-col gap-6">
        <BlockFaq :items="faqItems" />
        <NuxtLink :to="path('faq')" :class="link">
          {{ t('home.allQuestions') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </BlockSection>
  </div>
</template>
