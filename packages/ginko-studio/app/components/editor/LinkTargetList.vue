<!-- The site's own pages under the link field (LinkPopover): the entries of collections with a page, by title, and the
     static pages, by path. It lives inside the open popover, so the titles are read only while it is open. -->
<script setup lang="ts">
import { computed, inject, watch } from 'vue'
import { useI18n } from '#imports'
import { CommandGroup, CommandItem, CommandList } from '@studio/components/ui/command'
import { useRefs } from '../fields/refs'
import { EDITOR_FILES, EDITOR_LINK_TARGETS } from './context.ts'

/** A page of the site: its route link, and how the person knows it (title or path, and the area). */
export interface LinkTarget { href: string; label: string; area: string }

const props = defineProps<{
  /** What was typed; empty shows no list (nothing typed yet, or a web address). */
  query: string
  /** The route link the open link has, to show its title instead. */
  current?: string
}>()
const emit = defineEmits<{ pick: [target: LinkTarget]; found: [target: LinkTarget] }>()
const { t } = useI18n()

const targets = inject(EDITOR_LINK_TARGETS, () => undefined)()
// Pages show their path in the text's language.
const locale = inject(EDITOR_FILES, undefined)?.locale()
const refs = useRefs()
const lists = (targets?.routed ?? []).map((brick) => ({ brick, area: refs.brickLabel(brick), entries: refs.options(() => brick) }))
const all = computed<LinkTarget[]>(() => [
  // By the entry id, not its address: a later change of the address keeps the link working, and an import rewrites the
  // id with the entry's new one (seed.ts importRefs).
  ...lists.flatMap(({ brick, area, entries }) => entries.value.map((e) => ({ href: `$${brick}.${e.id}`, label: e.title, area }))),
  ...Object.entries(targets?.pages ?? {}).map(([key, paths]) => ({ href: `$page.${key}`, label: (locale && paths[locale]) || Object.values(paths)[0] || key, area: '' })),
])
/** Any case, and letters without their accents: "gesause" finds "Gesäuse". */
const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
const shown = computed(() => {
  const q = fold(props.query.trim())
  return q ? all.value.filter((x) => fold(x.label).includes(q) || fold(x.area).includes(q)).slice(0, 30) : []
})
watch(() => all.value.find((x) => x.href === props.current), (hit) => { if (hit) emit('found', hit) }, { immediate: true })
</script>

<template>
  <template v-if="query.trim()">
    <CommandList v-if="shown.length" class="max-h-56" :aria-label="t('editor.link.ownPages')">
      <CommandGroup :heading="t('editor.link.ownPages')">
        <CommandItem v-for="x in shown" :key="x.href" :value="x.href" class="min-h-10 pointer-coarse:min-h-11" @select="emit('pick', x)">
          <span class="min-w-0 flex-1 truncate">{{ x.label }}</span>
          <span v-if="x.area" class="shrink-0 text-xs text-muted-foreground">{{ x.area }}</span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
    <p v-else class="px-1 text-sm text-muted-foreground">{{ t('editor.link.noPage') }}</p>
  </template>
</template>
