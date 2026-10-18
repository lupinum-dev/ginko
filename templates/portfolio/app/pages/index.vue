<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

// The home page answers "what do you make, and is it good?" with the work itself: one sentence and a lead
// (content/home.md) with the one main action, "Start a project" (an email with its subject) and the address written
// out below it, for a visitor whose browser opens no mail app; then the first three projects of content/projects/ as
// large photos, the latest journal entries, and a closing band with the same action and the email, phone and address
// of content/site.md (SiteContact). A section whose list is empty is left out.
const home = useGinko('home')
const projects = useGinko('projects')
const site = useGinko('site')
const posts = useBlogPosts()
const start = useStartProject()
const path = useGinkoPath()
const { t } = useI18n()
const selected = computed(() => projects.value.items.slice(0, 3))
const latest = computed(() => posts.value.slice(0, 2))
const email = computed(() => site.value.data.email)
// The tab and search result say what the studio does and where; the share card keeps the sentence of the first screen
// and the photo of the first project. Search engines learn that the studio is a ProfessionalService.
usePageSeo(() => ({
  home: true,
  title: t('home.title'),
  description: home.value.data.lead,
  image: selected.value[0]?.data.image,
  organization: { '@type': 'ProfessionalService' },
}))
</script>

<template>
  <div>
    <BlockHero
      :title="home.data.title"
      :lead="home.data.lead"
      :primary="start ? { label: t('start.action'), to: start } : undefined"
    >
      <p v-if="email" class="text-small text-muted-foreground">
        {{ t('start.or') }} <a :href="`mailto:${email}`" dir="ltr" class="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4">{{ email }}</a>
      </p>
    </BlockHero>

    <BlockSection v-if="selected.length" :title="t('home.work')" :side="false">
      <ProjectsList :items="selected" feature heading-level="h3" />
      <NuxtLink :to="path('projects')" class="mt-8 inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
        {{ t('projects.all') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </BlockSection>

    <BlockSection v-if="latest.length" :title="t('home.journal')">
      <BlogPostList :items="latest" heading-level="h3" />
      <NuxtLink :to="path('news')" class="mt-6 inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
        {{ t('blog.latest') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </BlockSection>

    <BlockCta v-if="start" :title="t('home.cta.title')" :text="t('home.cta.text')" :action="{ label: t('start.action'), to: start }">
      <SiteContact :address="false" />
    </BlockCta>
  </div>
</template>
