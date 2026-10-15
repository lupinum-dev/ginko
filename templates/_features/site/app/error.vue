<script setup lang="ts">
import type { NuxtError } from '#app'

// 404 and other errors, in the site's layout and language, never indexed. The way out is the home page.
const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n('site')
const path = useGinkoPath()
const notFound = computed(() => props.error.statusCode === 404)
const title = computed(() => (notFound.value ? t('error.notFound') : t('error.failed')))
const { name } = useGinkoSite()
useHead(() => ({ title: `${title.value} · ${name}`, meta: [{ name: 'robots', content: 'noindex' }] }))

/** Leaves the error state, so the next page renders normally. */
function home() {
  clearError({ redirect: path('home') })
}
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto max-w-page px-gutter pt-12 md:pt-20">
      <div class="flex max-w-3xl flex-col gap-5">
        <p class="text-small font-medium text-muted-foreground tabular-nums">{{ t('error.code', { code: String(error.statusCode) }) }}</p>
        <h1 class="text-h1">{{ title }}</h1>
        <p class="text-lead text-muted-foreground">{{ notFound ? t('error.notFoundText') : t('error.failedText') }}</p>
        <div class="mt-2">
          <Button as-child size="lg">
            <a :href="path('home')" @click.prevent="home">{{ t('error.home') }}</a>
          </Button>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>
