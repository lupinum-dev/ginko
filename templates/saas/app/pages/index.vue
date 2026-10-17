<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

// The home page answers "what does it do, for whom, and what does it cost?" in the first screen: one sentence and a
// lead (content/home.md), the free trial in the app as the main action, the prices as the second, and a picture of
// the product. Then the main features, the latest changes, the customers (logos and one quote) with the facts about
// security and data, and the closing band with the free trial (app/components/site/PageCta.vue). A section whose
// list is empty is left out.
const home = useGinko('home')
const logos = useGinko('logos')
const quotes = useGinko('quotes')
const releases = await useLatestReleases(3)
const security = useSiteLinks(() => [{ entry: 'pages/security' }])
const path = useGinkoPath()
const { t } = useI18n()
const trial = computed(() => ({ label: t('home.trial'), to: home.value.data.trialUrl }))
const quote = computed(() => quotes.value.items[0])
const features = computed(() => home.value.data.features.map((item) => ({ title: item.title, text: item.text })))
const facts = computed(() => home.value.data.facts.map((item) => ({ title: item.title, text: item.text })))
// The tab and search result say what the product is; the share card keeps the sentence of the first screen.
usePageSeo(() => ({ home: true, title: t('home.title'), description: home.value.data.lead, image: home.value.data.image }))
</script>

<template>
  <div>
    <BlockHero
      :title="home.data.title"
      :lead="home.data.lead"
      :image="home.data.image"
      :primary="trial"
      :secondary="{ label: t('home.pricing'), to: path('pricing') }"
    >
      <p class="text-small text-muted-foreground">{{ t('home.trialNote') }}</p>
    </BlockHero>

    <BlockSection v-if="features.length" :title="t('home.features')" :lead="t('home.featuresLead')">
      <BlockFeatures :items="features" />
    </BlockSection>

    <BlockSection v-if="releases.length" :title="t('changelog.latest')">
      <ChangelogLatest :items="releases" />
    </BlockSection>

    <BlockSection v-if="logos.items.length || quote" :title="t('home.customers')" :lead="t('home.customersLead')">
      <div class="flex flex-col gap-12">
        <BlockLogos v-if="logos.items.length" :items="logos.items" />
        <BlockQuote v-if="quote" :text="quote.data.text" :name="quote.data.name" :role="quote.data.role" />
      </div>
    </BlockSection>

    <BlockSection v-if="facts.length" :title="t('home.security')">
      <div class="flex flex-col gap-6">
        <BlockFeatures :items="facts" />
        <NuxtLink v-if="security[0]" :to="security[0].to" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline">
          {{ t('home.securityMore') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </BlockSection>

    <SitePageCta />
  </div>
</template>
