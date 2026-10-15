<!-- The bricks of the site for Alles bearbeiten: a side list on wide screens, a list page on phones.
     A dot marks an area with translation gaps; at the end `Removed` when something was removed (UI.md 10.6). -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Brick } from '@lupinum/ginko'
import { useStudioSite } from '../utils/labels'

const props = defineProps<{ slug: string; bricks: [string, Brick][]; current?: string; removedActive?: boolean }>()
const { shown } = useStudioSite()
const { t } = useI18n()

const { data: translation } = useConvexQuery(api.sites.translationStatus, () => ({ site: props.slug }))
const incomplete = (key: string) => {
  const status = translation.value?.bricks.find((b) => b.brick === key)
  return (translation.value?.locales ?? []).some((locale) => (status?.locales[locale]?.missing ?? 0) + (status?.locales[locale]?.outdated ?? 0) > 0)
}
// The site row says whether anything is removed; the trash itself is read only on its own page.
const { data: meta } = useConvexQuery(api.sites.meta, () => ({ site: props.slug }))
const hasTrash = computed(() => meta.value?.site.hasTrash ?? false)
</script>

<template>
  <nav class="grid gap-0.5" :aria-label="t('nav.areas')">
    <Button
      v-for="[key, brick] in bricks" :key="key" as-child variant="ghost"
      :class="['h-auto min-h-11 justify-between gap-3 rounded-md whitespace-normal px-3 py-2 text-left font-medium hover:bg-muted', key === current && 'bg-accent text-accent-foreground hover:bg-accent']"
    >
      <NuxtLink :to="`/s/${slug}/all/${key}`" :aria-current="key === current ? 'page' : undefined">
        <!-- Long labels wrap inside the side list instead of running into the form. -->
        <span class="min-w-0">
          {{ shown(brick.label) }}
          <!-- One quiet mark per area; the list of the area shows which entry and language. -->
          <template v-if="incomplete(key)">
            <span class="ml-1.5 inline-block size-2 rounded-full bg-warning align-middle" aria-hidden="true" :title="t('basics.translation.incomplete')" />
            <span class="sr-only">({{ t('basics.translation.incomplete') }})</span>
          </template>
        </span>
        <span class="shrink-0 text-[13px] font-normal text-muted-foreground">{{ brick.kind === 'collection' ? t('nav.list') : '' }}</span>
      </NuxtLink>
    </Button>
    <Button
      v-if="hasTrash" as-child variant="ghost"
      :class="['h-auto min-h-11 justify-start rounded-md px-3 py-2 text-left font-medium text-muted-foreground hover:bg-muted', removedActive && 'bg-accent text-accent-foreground hover:bg-accent']"
    >
      <NuxtLink :to="`/s/${slug}/all?removed`" :aria-current="removedActive ? 'page' : undefined">{{ t('basics.removed.link') }}</NuxtLink>
    </Button>
  </nav>
</template>
