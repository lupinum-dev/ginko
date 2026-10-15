<script setup lang="ts">
definePageMeta({ layout: 'site' })
const { t } = useI18n()
const s = await useSiteData()
const { editable } = allAccess(s)
// `?removed`: the removed entries of all areas; `?translations`: the open translations of all areas (UI.md 10.6).
const route = useRoute()
const removedView = computed(() => 'removed' in route.query)
const translationsView = computed(() => !removedView.value && 'translations' in route.query)
useHead(() => ({ title: t('site.title.all', { site: s.site.value?.name ?? t('site.fallback.site') }) }))
</script>

<template>
  <AllShell
    :slug="s.slug.value" :bricks="editable" :removed-active="removedView" :translations-active="translationsView"
    :back="removedView || translationsView ? { to: `/s/${s.slug.value}/all`, label: t('site.all.allAreas') } : undefined"
  >
    <RemovedList v-if="removedView" :slug="s.slug.value" :schema="s.schema.value" />
    <TranslationList v-else-if="translationsView" :slug="s.slug.value" :bricks="editable" />
    <template v-else>
      <h1 class="text-xl font-semibold tracking-tight">{{ t('site.all.heading') }}</h1>
      <p class="mt-1 mb-4 text-muted-foreground">{{ t('site.all.lede') }}</p>
      <AllNav class="list min-[900px]:hidden" :slug="s.slug.value" :bricks="editable" />
    </template>
  </AllShell>
</template>
