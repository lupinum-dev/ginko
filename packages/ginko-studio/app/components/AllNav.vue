<!-- The bricks of the site for Alles bearbeiten: a side list on wide screens, a list page on phones. After the
     areas, `Übersetzungen` with the number of open translations (only while there are some), and `Entfernt` when
     something was removed (UI.md 10.6). -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Brick } from '@lupinum/ginko'
import { useStudioSite } from '../utils/labels'

const props = defineProps<{ slug: string; bricks: [string, Brick][]; current?: string; removedActive?: boolean; translationsActive?: boolean }>()
const { shown } = useStudioSite()
const { t, locale: uiLocale } = useI18n()

// Open translations of the areas listed here: one per entry and language with a missing or outdated text.
const { data: translation } = useConvexQuery(api.sites.translationStatus, () => ({ site: props.slug, language: uiLocale.value }))
const openTranslations = computed(() => {
  const listed = new Set(props.bricks.map(([key]) => key))
  return (translation.value?.bricks ?? []).filter((b) => listed.has(b.brick))
    .reduce((sum, b) => sum + Object.values(b.locales).reduce((n, l) => n + l.missing + l.outdated, 0), 0)
})
// The site row says whether anything is removed; the trash itself is read only on its own page.
const { data: meta } = useConvexQuery(api.sites.meta, () => ({ site: props.slug }))
const hasTrash = computed(() => meta.value?.site.hasTrash ?? false)
</script>

<template>
  <nav class="grid gap-0.5" :aria-label="t('nav.areas')">
    <Button
      v-for="[key, brick] in bricks" :key="key" as-child variant="ghost"
      :class="['h-auto min-h-11 justify-start gap-3 rounded-md whitespace-normal px-3 py-2 text-left font-medium hover:bg-muted', key === current && 'bg-accent text-accent-foreground hover:bg-accent']"
    >
      <NuxtLink :to="`/s/${slug}/all/${key}`" :aria-current="key === current ? 'page' : undefined">
        <!-- Long labels wrap inside the side list instead of running into the form. -->
        <span class="min-w-0">{{ shown(brick.label) }}</span>
      </NuxtLink>
    </Button>
    <Button
      v-if="openTranslations" as-child variant="ghost"
      :class="['h-auto min-h-11 justify-between gap-3 rounded-md whitespace-normal px-3 py-2 text-left font-medium hover:bg-muted', translationsActive && 'bg-accent text-accent-foreground hover:bg-accent']"
    >
      <NuxtLink :to="`/s/${slug}/all?translations`" :aria-current="translationsActive ? 'page' : undefined">
        <span class="min-w-0">{{ t('nav.translations') }}</span>
        <span class="shrink-0 text-[13px] font-normal text-muted-foreground">{{ t('nav.translationsOpen', { count: openTranslations }) }}</span>
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
