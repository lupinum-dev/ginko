<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'
import type { Card } from '~/components/block/Cards.vue'

// The home page answers "what do you make, and can it solve my problem?" in the first screen: what the company makes
// in one sentence (content/home.md) with the photo, and one main action, contact sales. Then the products and
// services, the references (customer logos and one quote), the latest news, the open jobs and the next trade fair,
// and a closing band with the way to sales and the company's phone. A section whose list is empty is left out.
const home = useGinko('home')
const site = useGinko('site')
const quotes = useGinko('quotes')
const logos = useGinko('logos')
const fairs = useGinko('events')
const services = useServiceCards(() => 3)
const posts = useBlogPosts()
const jobs = useOpenJobs()
const { when } = useEventText()
const path = useGinkoPath()
const { t } = useI18n()
const latest = computed(() => posts.value.slice(0, 3))
const quote = computed(() => quotes.value.items[0])
const contact = computed(() => site.value.data)
const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`

// Open jobs and the next trade fair, as two cards: the jobs card always shows (with no open job it invites an open
// application), the fair card only while a fair is coming up.
const next = computed<Card[]>(() => {
  const fair = fairs.value.items[0]
  const count = jobs.value.length
  return [
    { key: 'jobs', title: t('home.jobs.title'), to: path('jobs'), meta: count ? t('home.jobs.count', { count }) : t('home.jobs.none'), text: t('home.jobs.text') },
    ...(fair ? [{ key: fair.id, title: fair.data.title, to: fair.url, meta: when(fair.data, 'short'), text: fair.data.location ?? undefined }] : []),
  ]
})
// The tab and search result say what the company makes; the share card keeps the sentence of the first screen.
usePageSeo(() => ({ home: true, title: t('home.title'), description: home.value.data.lead, image: home.value.data.image }))
</script>

<template>
  <div>
    <BlockHero
      :title="home.data.title"
      :lead="home.data.lead"
      :image="home.data.image"
      :primary="{ label: t('home.sales'), to: path('team') }"
      :secondary="{ label: t('home.catalogue'), to: path('services') }"
    />

    <BlockSection v-if="services.length" :title="t('home.products')" :side="false">
      <BlockCards :items="services" compact />
      <NuxtLink :to="path('services')" class="mt-6 inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
        {{ t('home.allProducts') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </BlockSection>

    <BlockSection v-if="logos.items.length || quote" :title="t('home.references')" :lead="t('home.referencesLead')">
      <div class="flex flex-col gap-12">
        <BlockLogos v-if="logos.items.length" :items="logos.items" />
        <BlockQuote v-if="quote" :text="quote.data.text" :name="quote.data.name" :role="quote.data.role" />
      </div>
    </BlockSection>

    <BlockSection v-if="latest.length" :title="t('home.news')">
      <BlogPostList :items="latest" heading-level="h3" />
      <NuxtLink :to="path('news')" class="mt-6 inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
        {{ t('blog.latest') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </BlockSection>

    <BlockSection :title="t('home.next')" :side="false">
      <BlockCards :items="next" :columns="2" />
    </BlockSection>

    <BlockCta :title="t('home.cta.title')" :text="t('home.cta.text')" :action="{ label: t('home.sales'), to: path('team') }">
      <p v-if="contact.phone || contact.email" class="flex flex-wrap gap-x-6 text-body">
        <a v-if="contact.phone" :href="tel(contact.phone)" dir="ltr" class="inline-flex min-h-11 items-center font-medium tabular-nums underline underline-offset-4">{{ contact.phone }}</a>
        <a v-if="contact.email" :href="`mailto:${contact.email}`" dir="ltr" class="inline-flex min-h-11 items-center font-medium underline underline-offset-4">{{ contact.email }}</a>
      </p>
    </BlockCta>
  </div>
</template>
