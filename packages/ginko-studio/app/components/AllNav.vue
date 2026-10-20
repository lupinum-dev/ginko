<!-- The bricks of the site for Inhalte: the side column on wide screens (with `Overview` first), the list page on phones.
     Each list area shows how many entries it has. After the areas, `Übersetzungen` with the
     number of open translations (only while there are some), and `Papierkorb` when something was removed (UI.md 10.6).
     Counts are aria-hidden: the link names stay the area labels (the e2e tests click them by name). -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Brick } from '@lupinum/ginko'
import { LanguagesIcon, LayoutGridIcon, Trash2Icon } from '@lucide/vue'
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

const row = 'flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-foreground no-underline outline-none hover:bg-foreground/[0.05] focus-visible:ring-3 focus-visible:ring-ring/80 aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground min-[900px]:min-h-9'
</script>

<template>
  <nav class="grid gap-px" :aria-label="t('nav.areas')">
    <NuxtLink v-if="overview" :to="`/s/${slug}/all`" :class="row" :aria-current="onOverview ? 'page' : undefined">
      <LayoutGridIcon class="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      <span class="min-w-0 flex-1">{{ t('site.all.overview') }}</span>
    </NuxtLink>
    <p v-if="overview" class="px-2.5 pt-4 pb-1.5 text-xs font-medium text-muted-foreground">{{ t('site.all.areas') }}</p>
    <NuxtLink
      v-for="[key, brick] in bricks" :key="key" :to="`/s/${slug}/all/${key}`" :class="row"
      :aria-current="key === current ? 'page' : undefined"
    >
      <!-- Long labels wrap inside the side list instead of running into the form. -->
      <span class="min-w-0 flex-1">{{ shown(brick.label) }}</span>
      <span v-if="brick.kind === 'collection' && byBrick.get(key)" class="min-w-5 flex-none text-right text-xs font-normal text-muted-foreground tabular-nums" aria-hidden="true">{{ format.number(byBrick.get(key)!.count) }}</span>
    </NuxtLink>
    <div v-if="openTranslations || hasTrash" class="mt-2 grid gap-px border-t pt-2">
      <NuxtLink v-if="openTranslations" :to="`/s/${slug}/all?translations`" :class="row" :aria-current="translationsActive ? 'page' : undefined">
        <LanguagesIcon class="size-4 flex-none text-muted-foreground" aria-hidden="true" />
        <span class="min-w-0 flex-1">{{ t('nav.translations') }}</span>
        <span class="flex-none text-xs font-normal text-warning">{{ t('nav.translationsOpen', { count: openTranslations }) }}</span>
      </NuxtLink>
      <NuxtLink v-if="hasTrash" :to="`/s/${slug}/all?removed`" :class="[row, 'text-muted-foreground']" :aria-current="removedActive ? 'page' : undefined">
        <Trash2Icon class="size-4 flex-none" aria-hidden="true" />
        <span class="min-w-0 flex-1">{{ t('basics.removed.link') }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>
