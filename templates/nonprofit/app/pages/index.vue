<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

// The home page answers "what do you do, and how can I help?" in the first screen: the mission (content/home.md) with
// the river photo, "Get involved" and "Donate". Then the current projects, the latest news, a quote, the partners and
// one closing band that invites to the next clean-up. Donations go through the Donate page (a link to a donation
// service, no payment form on this site).
const home = useGinko('home')
const quotes = useGinko('quotes')
const logos = useGinko('logos')
const posts = useBlogPosts()
const projects = useProjectCards()
const path = useGinkoPath()
const { t } = useI18n()
const links = useSiteLinks(() => [{ entry: 'pages/get-involved' }, { entry: 'pages/donate' }])
const link = (key: string) => links.value.find((l) => l.key === key)
const latest = computed(() => posts.value.slice(0, 3))
const quote = computed(() => quotes.value.items[0])
usePageSeo(() => ({ home: true, description: home.value.data.lead, image: home.value.data.image }))
</script>

<template>
  <div>
    <BlockHero
      :title="home.data.title"
      :lead="home.data.lead"
      :image="home.data.image"
      :primary="link('pages/get-involved')"
      :secondary="link('pages/donate')"
    />

    <BlockSection :title="t('home.projects')" :side="false">
      <BlockCards v-if="projects.length" :items="projects" />
      <BlockEmpty v-else :title="t('projects.empty')" path="content/projects/" />
      <NuxtLink :to="path('projects')" class="mt-6 inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
        {{ t('projects.all') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </BlockSection>

    <BlockSection :title="t('home.news')">
      <BlogPostList v-if="latest.length" :items="latest" heading-level="h3" />
      <BlockEmpty v-else :title="t('blog.empty')" path="content/posts/" />
      <NuxtLink :to="path('news')" class="mt-6 inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
        {{ t('blog.latest') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </BlockSection>

    <!-- Events: the next dates (content/events/) go here once the events pages are part of this template. -->

    <BlockSection v-if="quote" :title="t('home.voices')">
      <BlockQuote :text="quote.data.text" :name="quote.data.name" :role="quote.data.role" />
    </BlockSection>

    <BlockSection v-if="logos.items.length" :title="t('home.partners')">
      <BlockLogos :items="logos.items" />
    </BlockSection>

    <BlockCta
      v-if="link('pages/get-involved')"
      :title="t('home.cta.title')"
      :text="t('home.cta.text')"
      :action="{ label: t('home.cta.action'), to: link('pages/get-involved')!.to }"
    />
  </div>
</template>
