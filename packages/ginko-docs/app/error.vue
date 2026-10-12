<script setup lang="ts">
// Not found and other errors, inside the site's frame (the layer's layout, or the site's own). A site with its own
// error.vue replaces this one.
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const { t, localePath } = useI18n()
const docs = useDocs()
const notFound = computed(() => props.error.statusCode === 404)
useGinkoSeo(() => ({ title: notFound.value ? t('docs.notFound.title') : t('docs.error.title'), noindex: true }))
// Links work without JavaScript; with it, clearError leaves the error state and navigates.
const leave = (to: string) => clearError({ redirect: to })
</script>

<template>
  <NuxtLayout>
    <main class="docs-error">
      <div>
        <p class="docs-error-code">{{ error.statusCode }}</p>
        <h1>{{ notFound ? t('docs.notFound.title') : t('docs.error.title') }}</h1>
        <p>{{ notFound ? t('docs.notFound.text') : t('docs.error.text') }}</p>
        <div class="docs-error-actions">
          <a :href="localePath('/')" class="docs-button is-large is-primary" @click.prevent="leave(localePath('/'))">{{ t('docs.notFound.home') }}</a>
          <a v-if="docs.first.value" :href="docs.first.value" class="docs-button is-large is-soft" @click.prevent="leave(docs.first.value)">{{ t('docs.docs') }}</a>
        </div>
      </div>
    </main>
  </NuxtLayout>
</template>
