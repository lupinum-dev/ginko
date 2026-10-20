<!-- What the Studio shows instead of a page: an unknown address (404) or a failure while rendering. In the Studio's
     frame and language, with a way back: the site's start page (Heute) when the address was under one, and Meine Seiten.
     A link clears the error by itself (Nuxt's router does on every navigation). -->
<script setup lang="ts">
import type { NuxtError } from '#app'
import { Button } from '@studio/components/ui/button'

const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()
const route = useRoute()
const notFound = computed(() => (props.error.status ?? props.error.statusCode) === 404)
/** The site the address was under (/s/<site>/…), if any. */
const site = computed(() => /^\/s\/([^/]+)/.exec(route.path)?.[1])
const words = computed(() => (notFound.value ? 'errors.notFound' : 'errors.other'))
useHead(() => ({ title: `${t(`${words.value}.title`)} · Ginko` }))
// `force`: a second try within Nuxt's 10 s guard must reload too.
const reload = () => reloadNuxtApp({ force: true })
</script>

<template>
  <NuxtLayout name="default">
    <main class="grid w-full gap-5 rounded-2xl border bg-card p-6 sm:p-8">
      <h1 class="text-xl font-semibold tracking-tight">{{ t(`${words}.title`) }}</h1>
      <p class="text-muted-foreground">{{ t(`${words}.text`) }}</p>
      <div class="flex flex-wrap gap-2">
        <Button v-if="!notFound" type="button" @click="reload">{{ t('errors.reload') }}</Button>
        <Button v-if="site" as-child :variant="notFound ? 'default' : 'outline'"><NuxtLink :to="`/s/${site}`">{{ t('nav.quick') }}</NuxtLink></Button>
        <Button as-child :variant="notFound && !site ? 'default' : 'outline'"><NuxtLink to="/?all">{{ t('nav.mySites') }}</NuxtLink></Button>
      </div>
    </main>
  </NuxtLayout>
</template>
