<script setup lang="ts">
definePageMeta({ layout: 'site' })
const { t } = useI18n()
const s = await useSiteData()
const { editable } = allAccess(s)
// `?removed`: the removed entries of all areas (UI.md 10.6).
const route = useRoute()
const removedView = computed(() => 'removed' in route.query)
useHead(() => ({ title: t('site.title.all', { site: s.site.value?.name ?? t('site.fallback.site') }) }))
</script>

<template>
  <AllShell :slug="s.slug.value" :bricks="editable" :removed-active="removedView" :back="removedView ? { to: `/s/${s.slug.value}/all`, label: t('site.all.allAreas') } : undefined">
    <RemovedList v-if="removedView" :slug="s.slug.value" :schema="s.schema.value" />
    <template v-else>
      <!-- Staff see only the areas they hold a task in, so the page does not promise "everything". -->
      <h1 class="text-xl font-semibold tracking-tight">{{ s.isManager.value ? t('site.all.heading') : t('site.all.headingStaff') }}</h1>
      <p class="mt-1 mb-4 text-muted-foreground">{{ s.isManager.value ? t('site.all.lede') : t('site.all.ledeStaff') }}</p>
      <AllNav class="list min-[900px]:hidden" :slug="s.slug.value" :bricks="editable" />
    </template>
  </AllShell>
</template>
