<!-- The bricks of the site for Inhalte: the side column on wide screens (with `Overview` first), the list page on phones.
     Each list area shows how many entries it has. After the areas, `Übersetzungen` with the
     number of open translations (only while there are some), and `Papierkorb` when something was removed (UI.md 10.6).
     Counts are aria-hidden: the link names stay the area labels (the e2e tests click them by name).
     The side column groups the areas (lists first, then single pages) and marks the current one with the gold dot;
     the phone list keeps the site's own order. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Brick } from '@lupinum/ginko'
import { LanguagesIcon, Trash2Icon } from '@lucide/vue'
import { Badge } from '@studio/components/ui/badge'
import { useStudioSite } from '../utils/labels'

const props = defineProps<{ slug: string; bricks: [string, Brick][]; current?: string; removedActive?: boolean; translationsActive?: boolean; overview?: boolean }>()
const { shown } = useStudioSite()
const { t, format } = useI18n()
const route = useRoute()

const { data: areas } = useConvexQuery(api.sites.areas, () => ({ site: props.slug }))
const byBrick = computed(() => new Map((areas.value ?? []).map((a) => [a.brick, a])))
// Open translations of the areas listed here: one per entry and language with a missing or outdated text.
const openTranslations = computed(() => props.bricks.reduce((sum, [key]) => sum + (byBrick.value.get(key)?.translations ?? 0), 0))
// The site row says whether anything is removed; the trash itself is read only on its own page.
const { data: meta } = useConvexQuery(api.sites.meta, () => ({ site: props.slug }))
const hasTrash = computed(() => meta.value?.site.hasTrash ?? false)
const onOverview = computed(() => props.overview && !props.current && !props.removedActive && !props.translationsActive && route.path === `/s/${props.slug}/all`)
const groups = computed(() => {
  if (!props.overview) return [{ label: '', items: props.bricks }]
  return [
    { label: t('site.all.areas'), items: props.bricks.filter(([, brick]) => brick.kind === 'collection') },
    { label: t('site.all.singles'), items: props.bricks.filter(([, brick]) => brick.kind !== 'collection') },
  ].filter((group) => group.items.length)
})

// The current row: a white tile with a hairline, and the gold dot before its label ("you are here").
const row = "flex min-h-11 items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-left text-sm text-foreground no-underline outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/80 aria-[current=page]:bg-card aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_0_0_0_1px_var(--border)] aria-[current=page]:before:size-[7px] aria-[current=page]:before:flex-none aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-marker aria-[current=page]:before:content-[''] min-[900px]:min-h-[34px] min-[900px]:py-1"
const label = 'px-2.5 pt-3.5 pb-1 text-xs font-semibold text-muted-foreground'
</script>

<template>
  <nav :class="['flex flex-col gap-0.5', overview && 'min-[900px]:min-h-full']" :aria-label="t('nav.areas')">
    <NuxtLink v-if="overview" :to="`/s/${slug}/all`" :class="[row, 'font-medium']" :aria-current="onOverview ? 'page' : undefined">
      <span class="min-w-0 flex-1">{{ t('site.all.overview') }}</span>
    </NuxtLink>
    <template v-for="group in groups" :key="group.label">
      <p v-if="group.label" :class="label">{{ group.label }}</p>
      <NuxtLink
        v-for="[key, brick] in group.items" :key="key" :to="`/s/${slug}/all/${key}`" :class="row"
        :aria-current="key === current ? 'page' : undefined"
      >
        <!-- Long labels wrap inside the side list instead of running into the form. -->
        <span class="min-w-0 flex-1">{{ shown(brick.label) }}</span>
        <span v-if="brick.kind === 'collection' && byBrick.get(key)" class="min-w-5 flex-none text-right text-xs font-normal text-muted-foreground tabular-nums" aria-hidden="true">{{ format.number(byBrick.get(key)!.count) }}</span>
      </NuxtLink>
    </template>
    <div v-if="openTranslations || hasTrash" :class="['mt-2 grid gap-0.5 border-t pt-2.5', overview && 'min-[900px]:mt-auto']">
      <NuxtLink v-if="openTranslations" :to="`/s/${slug}/all?translations`" :class="row" :aria-current="translationsActive ? 'page' : undefined">
        <LanguagesIcon v-if="!overview" class="size-4 flex-none text-muted-foreground" aria-hidden="true" />
        <span class="min-w-0 flex-1">{{ t('nav.translations') }}</span>
        <Badge variant="warning" class="h-5 px-[7px] py-0">{{ t('nav.translationsOpen', { count: openTranslations }) }}</Badge>
      </NuxtLink>
      <NuxtLink v-if="hasTrash" :to="`/s/${slug}/all?removed`" :class="row" :aria-current="removedActive ? 'page' : undefined">
        <Trash2Icon v-if="!overview" class="size-4 flex-none text-muted-foreground" aria-hidden="true" />
        <span class="min-w-0 flex-1">{{ t('basics.removed.link') }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>
