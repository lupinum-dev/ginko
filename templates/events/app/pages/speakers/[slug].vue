<!-- Synced from templates/_features/sessions/app/pages/speakers/[slug].vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { personJsonLd } from '@lupinum/ginko/basics'
import { ArrowLeft } from '@lucide/vue'

// One speaker: photo or initials, name, role, short bio, and their sessions with day, time and room, read from the
// programme (useSessions), so a moved session is right here too. Person JSON-LD. An unknown speaker is a 404.
const route = useRoute()
const person = useGinkoEntry('people', () => route.params.slug)
const rows = useSessions()
const { t } = useI18n('sessions')
const { url } = useGinkoSite()
const path = useGinkoPath()
const talks = computed(() => rows.value.filter((row) => row.speakers.some((speaker) => speaker.id === person.value.id)))
const absolute = (p: string) => new URL(p, url).href
usePageSeo(() => ({
  title: person.value.data.name,
  description: person.value.data.role ?? person.value.data.bio ?? undefined,
  image: person.value.data.photo ?? undefined,
  jsonLd: [personJsonLd({
    name: person.value.data.name,
    role: person.value.data.role,
    bio: person.value.data.bio,
    image: person.value.data.photo ? absolute(person.value.data.photo.url) : undefined,
    url: absolute(person.value.url),
  })],
}))
</script>

<template>
  <article>
    <div class="mx-auto max-w-page px-gutter pt-8 md:pt-12">
      <NuxtLink :to="path('speakers')" class="-ms-1 inline-flex min-h-11 items-center gap-2 px-1 text-small font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <ArrowLeft class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {{ t('speakers.all') }}
      </NuxtLink>
    </div>
    <header class="mx-auto max-w-page px-gutter pt-4">
      <div class="flex max-w-3xl flex-col gap-5">
        <GinkoImage
          v-if="person.data.photo"
          :image="person.data.photo"
          eager
          sizes="160px"
          class="aspect-4/5 w-40 rounded-block bg-muted object-cover"
        />
        <InitialsAvatar v-else :name="person.data.name" size="lg" />
        <h1 class="text-h1">{{ person.data.name }}</h1>
        <p v-if="person.data.role" class="text-lead text-muted-foreground">{{ person.data.role }}</p>
        <p v-if="person.data.bio" class="max-w-prose">{{ person.data.bio }}</p>
      </div>
    </header>
    <BlockSection :title="t('speakers.sessions')" :side="false">
      <ul v-if="talks.length" class="flex flex-col divide-y border-y">
        <li v-for="session in talks" :key="session.id">
          <SessionRow :session="session" day :self="person.id" />
        </li>
      </ul>
      <p v-else class="text-muted-foreground">{{ t('speakers.none') }}</p>
    </BlockSection>
  </article>
</template>
