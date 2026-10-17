<script setup lang="ts">
// Not found and other errors, inside the site's frame (the layer's layout, or the site's own). A site with its own
// error.vue replaces this one.
import type { NuxtError } from '#app'
import { docsMainLanguagePath } from './lib/docsPage'

const props = defineProps<{ error: NuxtError }>()
const { t, localePath, locales } = useI18n()
const docs = useDocs()
const route = useRoute()
const { mainLocale } = useGinkoSite()
const notFound = computed(() => props.error.statusCode === 404)
useGinkoSeo(() => ({ title: notFound.value ? t('docs.notFound.title') : t('docs.error.title'), noindex: true }))
// A 404 under another language's docs address offers the same address in the main language, named in itself. It is a
// guess (the slug may differ there); the language menu covers the normal way.
const mainPage = computed(() => {
  const path = notFound.value ? docsMainLanguagePath(route.path, locales.map((l) => l.code), mainLocale, docs.mainBase) : undefined
  return path && { path, language: locales.find((l) => l.code === mainLocale) }
})
// Links work without JavaScript; with it, clearError leaves the error state and navigates.
const leave = (to: string) => clearError({ redirect: to })
</script>

<template>
  <NuxtLayout>
    <div class="docs-error">
      <div>
        <p class="docs-error-code">{{ error.statusCode }}</p>
        <h1>{{ notFound ? t('docs.notFound.title') : t('docs.error.title') }}</h1>
        <p>{{ notFound ? t('docs.notFound.text') : t('docs.error.text') }}</p>
        <div class="docs-error-actions">
          <a :href="localePath('/')" class="docs-button is-large is-primary" @click.prevent="leave(localePath('/'))">{{ t('docs.notFound.home') }}</a>
          <a v-if="docs.first.value" :href="docs.first.value" class="docs-button is-large is-soft" @click.prevent="leave(docs.first.value)">{{ t('docs.docs') }}</a>
          <a v-if="mainPage" :href="mainPage.path" class="docs-button is-large is-soft" @click.prevent="leave(mainPage.path)">{{ t('docs.notFound.mainLanguage') }}<span v-if="mainPage.language" :lang="mainPage.language.language">: {{ mainPage.language.name }}</span></a>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>
