<script setup lang="ts">
import { Accessibility, CircleParking, MapPin, TramFront } from '@lucide/vue'

// How to book and how to find the practice: whether it is open now, then booking as on the home page (call with the
// phone hours, email, the online booking page when content/visit.md names one); then the address with "Open in maps",
// access, parking and public transport, the opening hours, and photos of the practice. No form: nothing is sent to
// other companies. The address per language comes from `pages.contact` in ginko.config.ts.
const gallery = useGinko('gallery')
const { visit, address, maps } = useVisit()
const { name } = useGinkoSite()
const { t } = useI18n()
const langOf = useGinkoLang()

const directions = computed(() => [
  { key: 'access', icon: Accessibility, label: t('visit.access'), text: visit.value.data.access },
  { key: 'parking', icon: CircleParking, label: t('visit.parking'), text: visit.value.data.parking },
  { key: 'transit', icon: TramFront, label: t('visit.transit'), text: visit.value.data.transit },
].filter((row) => row.text))
const images = computed(() => gallery.value.data.images.map((entry) => entry.image))
usePageSeo(() => ({ title: t('contact.title'), description: t('contact.lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('contact.title')" :lead="t('contact.lead')" />

    <div class="mx-auto flex max-w-page flex-col gap-6 px-gutter">
      <HoursToday />
      <VisitBook />
    </div>

    <BlockSection :title="t('contact.directions')">
      <div class="flex flex-col gap-8">
        <div v-if="address.length" class="flex flex-col gap-2">
          <address class="flex flex-col not-italic">
            <span class="font-semibold"><bdi>{{ name }}</bdi></span>
            <span v-for="line in address" :key="line"><bdi>{{ line }}</bdi></span>
          </address>
          <a v-if="maps" :href="maps" rel="noopener" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline underline-offset-4">
            <MapPin class="size-4 shrink-0" aria-hidden="true" />{{ t('visit.maps') }}
          </a>
        </div>
        <dl v-if="directions.length" class="flex flex-col border-b">
          <div v-for="row in directions" :key="row.key" class="grid items-baseline gap-1 border-t py-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-6">
            <dt class="flex items-center gap-2 font-semibold">
              <component :is="row.icon" class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{{ row.label }}
            </dt>
            <dd :lang="langOf(visit, row.key)">{{ row.text }}</dd>
          </div>
        </dl>
      </div>
    </BlockSection>

    <BlockSection :title="t('contact.hours')">
      <HoursTable />
    </BlockSection>

    <BlockSection v-if="images.length" :title="t('contact.practice')" :side="false">
      <BlockGallery :images="images" />
    </BlockSection>
  </div>
</template>
