<script setup lang="ts">
import { formatMoney } from '@lupinum/ginko'
import { isLunchPlaceholder, restaurantJsonLd } from '@lupinum/ginko-preset-gastro'
import { ArrowRight, Mail, MapPin, Phone } from '@lucide/vue'

// The home page answers the first questions on the first screen: open now, the menu, how to reserve (phone and email,
// no form) and where (the address with a map link). Below: today's lunch, a few dishes, the next events, photos, and
// the hours with the address.
const home = useGinko('home')
const site = useGinko('site')
const gallery = useGinko('gallery')
const { groups } = useMenu()
const { lunch, days } = useLunch()
const { ctx, today, now } = useHours()
const { name, url, timeZone } = useGinkoSite()
const { t, language } = useI18n('home')
const path = useGinkoPath()
const langOf = useGinkoLang()
const country: string = useRuntimeConfig().public.ginko.country
const { t: tm } = useI18n('menu')
const allergenName = useAllergenName()

const contact = computed(() => site.value.data)
const reserve = computed(() => (contact.value.phone ? { label: t('call', { phone: contact.value.phone }), to: telHref(contact.value.phone) } : undefined))
// A few dishes from the menu: the first mains, in the owner's order (the order of content/menu/).
const dishes = computed(() => (groups.value.find((group) => group.category === 'mains') ?? groups.value[0])?.dishes.slice(0, 4) ?? [])
const address = computed(() => [contact.value.street, [contact.value.postalCode, contact.value.city].filter(Boolean).join(' ')].filter(Boolean))
// "Open in maps": a link to OpenStreetMap with the address, no embedded map (nothing loads from another company).
const maps = computed(() => (address.value.length ? `https://www.openstreetmap.org/search?query=${encodeURIComponent([...address.value, country].join(', '))}` : undefined))

// Today's lunch while it is served; once today's lunch time is over, tomorrow's dish (or nothing), so the card never
// offers a dish the kitchen no longer serves. The lead says when lunch is served; a key under the card names the
// allergen letters, since a phone has no hover (hidden from screen readers, which read each letter's name already).
const lunchCard = computed(() => {
  const day = days.value.find((d) => d.today && !d.closed)
  if (day && !(day.served && clockIn(timeZone, now.value) >= day.served.to)) return { day, title: t('lunch') }
  const tomorrow = days.value.find((d) => d.date === plusDays(today.value, 1) && !d.closed)
  return tomorrow ? { day: tomorrow, title: t('lunchTomorrow') } : undefined
})
const lunchShowsAllergens = computed(() => lunchCard.value !== undefined && !isLunchPlaceholder(lunchCard.value.day.dish))
const lunchAllergens = computed(() => allergenList(lunchShowsAllergens.value ? lunchCard.value?.day.allergens.map(String) : []).map((code) => `${code} ${allergenName(code)}`).join(', '))

// The house for search engines: a Restaurant with address, phone, opening hours (the same rule as the page) and the
// menu with today's prices.
const absolute = (p: string) => new URL(p, url).href
const restaurant = computed(() => restaurantJsonLd({
  name,
  url: absolute(path('home')),
  today: today.value,
  hours: ctx.value,
  address: contact.value.street && contact.value.city ? { street: contact.value.street, postalCode: contact.value.postalCode, city: contact.value.city, country } : undefined,
  telephone: contact.value.phone,
  email: contact.value.email,
  menu: {
    url: absolute(path('menu')),
    sections: groups.value.map((group) => ({
      name: tm(`categories.${group.category}`),
      items: group.dishes.map((dish) => ({ name: dish.item.data.name, description: dish.item.data.description ?? undefined, price: dish.price })),
    })),
  },
}))
usePageSeo(() => ({ home: true, description: home.value.data.lead, image: home.value.data.image ?? undefined, organization: restaurant.value }))
</script>

<template>
  <div>
    <BlockHero
      :title="home.data.title"
      :lead="home.data.lead"
      :primary="reserve"
      :secondary="{ label: t('menu'), to: path('menu') }"
      :image="home.data.image ?? undefined"
    >
      <template #status>
        <HoursToday />
      </template>
      <div class="flex flex-col text-small text-muted-foreground">
        <p v-if="contact.email">
          {{ t('orEmail') }}
          <a :href="`mailto:${contact.email}`" class="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 hover:text-primary">{{ contact.email }}</a>
        </p>
        <p v-if="address.length" class="flex flex-wrap items-center gap-x-2">
          <MapPin class="size-4 shrink-0" aria-hidden="true" />
          <span>{{ address.join(', ') }}</span>
          <a v-if="maps" :href="maps" rel="noopener" class="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 hover:text-primary">{{ t('maps') }}</a>
        </p>
      </div>
    </BlockHero>

    <BlockSection v-if="lunchCard" :title="lunchCard.title" :lead="lunchCard.day.served ? tm('lunch.served', { from: lunchCard.day.served.from, to: lunchCard.day.served.to }) : undefined">
      <div class="flex flex-col gap-4 rounded-block border p-6">
        <div class="flex items-baseline justify-between gap-6">
          <p class="text-lead font-medium" :lang="langOf(lunch, `days.${lunchCard.day._id}.dish`)">{{ lunchCard.day.dish }}</p>
          <p v-if="lunchCard.day.price" class="shrink-0 text-lead tabular-nums">{{ formatMoney(lunchCard.day.price, language) }}</p>
        </div>
        <MenuAllergens v-if="lunchShowsAllergens" :codes="lunchCard.day.allergens.map(String)" />
        <p v-if="lunchAllergens" class="text-xs text-muted-foreground" aria-hidden="true">{{ tm('allergens.label', { names: lunchAllergens }) }}</p>
        <NuxtLink :to="path('lunch')" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline">
          {{ t('lunchWeek') }}
          <ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </BlockSection>

    <BlockSection v-if="dishes.length" :title="t('dishes')" :lead="t('dishesLead')">
      <ul class="flex flex-col divide-y border-y">
        <li v-for="dish in dishes" :key="dish.item.id">
          <MenuDish :dish="dish" />
        </li>
      </ul>
      <NuxtLink :to="path('menu')" class="mt-4 inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
        {{ t('fullMenu') }}
        <ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </BlockSection>

    <EventUpcoming :limit="3" />

    <BlockSection v-if="gallery.data.images.length" :title="t('gallery')" :side="false">
      <div class="flex flex-col gap-6">
        <BlockGallery :images="gallery.data.images.slice(0, 3).map((entry) => entry.image)" />
        <NuxtLink :to="path('gallery')" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline">
          {{ t('allPhotos') }}
          <ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </BlockSection>

    <BlockSection id="visit" :title="t('visit')" :side="false">
      <div class="grid gap-12 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-24">
        <div class="flex flex-col gap-4">
          <h3 class="text-body font-semibold">{{ t('hours') }}</h3>
          <HoursTable :level="4" />
        </div>
        <div class="flex flex-col gap-4">
          <h3 class="text-body font-semibold">{{ t('address') }}</h3>
          <address class="flex flex-col gap-1 not-italic">
            <span>{{ name }}</span>
            <span v-for="line in address" :key="line">{{ line }}</span>
          </address>
          <ul class="flex flex-col">
            <li v-if="maps">
              <a :href="maps" rel="noopener" class="inline-flex min-h-11 items-center gap-3 underline-offset-4 hover:underline">
                <MapPin class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{{ t('maps') }}
              </a>
            </li>
            <li v-if="contact.phone">
              <a :href="telHref(contact.phone)" class="inline-flex min-h-11 items-center gap-3 tabular-nums underline-offset-4 hover:underline">
                <Phone class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{{ contact.phone }}
              </a>
            </li>
            <li v-if="contact.email">
              <a :href="`mailto:${contact.email}`" class="inline-flex min-h-11 items-center gap-3 underline-offset-4 hover:underline">
                <Mail class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{{ contact.email }}
              </a>
            </li>
          </ul>
        </div>
      </div>
    </BlockSection>
  </div>
</template>
