<!-- "Wartet auf dich" (UI.md 3): what needs the person and is not a task button of a card: a rejected change to fix,
     changes to review, unsaved input, a planned change that did not go live. One action per tile. It shows as many
     tiles as the grid has columns (two on a phone), the rest behind "{n} weitere"; the classes decide, so the server
     render already has the right ones. -->
<script setup lang="ts">
import { computed, nextTick, ref, type Component } from 'vue'
import { CalendarXIcon, ClipboardCheckIcon, CircleXIcon, PencilLineIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'

export interface Tile {
  id: string
  kind: 'rejected' | 'review' | 'unsaved' | 'notLive'
  title: string
  sub?: string
  /** The second line says what went wrong (a rejection's reason). */
  subWarn?: boolean
  /** A short verb; the tile's title describes it. A link with `to`, else a button. */
  action: { label: string; primary?: boolean; to?: string; run?: () => void }
}

const props = defineProps<{ tiles: Tile[] }>()
const { t } = useI18n()

const icons: Record<Tile['kind'], Component> = { rejected: CircleXIcon, review: ClipboardCheckIcon, unsaved: PencilLineIcon, notLive: CalendarXIcon }
const hooks: Record<Tile['kind'], string> = { rejected: 'own-rejected', review: 'to-review', unsaved: 'unsaved', notLive: 'not-live' }
const accent = (tile: Tile) => tile.kind === 'rejected' || tile.kind === 'unsaved'

const expanded = ref(false)
const list = ref<HTMLElement>()
/** Two tiles always; the third with three columns; the others after "weitere". */
const hiddenClass = (i: number) => (expanded.value || i < 2 ? 'flex' : i === 2 ? 'hidden @[1060px]:flex' : 'hidden')
const n = computed(() => props.tiles.length)
/** The button goes away, so focus moves to the action of the first tile that was hidden. */
function expand() {
  const first = [...(list.value?.children ?? [])].find((li) => getComputedStyle(li).display === 'none')
  expanded.value = true
  nextTick(() => first?.querySelector<HTMLElement>('a[href], button')?.focus())
}
</script>

<template>
  <section v-if="tiles.length" :aria-label="t('today.waiting.label')" class="mb-3 grid gap-2 @[680px]:mb-5">
    <ul ref="list" class="m-0 grid list-none grid-cols-1 gap-2 p-0 @[680px]:grid-cols-2 @[680px]:gap-4 @[1060px]:grid-cols-3">
      <li
        v-for="(tile, i) in tiles"
        :key="tile.id"
        :class="[hiddenClass(i), accent(tile) && 'border-l-[3px] border-l-warning dark:border-l-warning']"
        class="min-h-12 items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-1.5 @[680px]:min-h-16 @[680px]:px-4 @[680px]:py-3 dark:border-border/50"
        :data-test="hooks[tile.kind]"
      >
        <component :is="icons[tile.kind]" class="size-4 flex-none" :class="accent(tile) ? 'text-warning' : 'text-muted-foreground'" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <p :id="`w-${i}`" class="line-clamp-2 text-sm leading-[18px] font-medium [overflow-wrap:anywhere]">{{ tile.title }}</p>
          <p v-if="tile.sub" class="mt-0.5 line-clamp-2 text-[13px] leading-[18px] [overflow-wrap:anywhere]" :class="tile.subWarn ? 'font-medium text-warning' : 'text-muted-foreground'">{{ tile.sub }}</p>
        </div>
        <Button v-if="tile.action.to" as-child :variant="tile.action.primary ? 'default' : 'outline'" size="sm" class="shrink-0 max-[679px]:min-h-12">
          <NuxtLink :to="tile.action.to" :aria-describedby="`w-${i}`">{{ tile.action.label }}</NuxtLink>
        </Button>
        <Button v-else type="button" :variant="tile.action.primary ? 'default' : 'outline'" size="sm" class="shrink-0 max-[679px]:min-h-12" :aria-describedby="`w-${i}`" @click="tile.action.run?.()">{{ tile.action.label }}</Button>
      </li>
    </ul>
    <Button v-if="n > 2 && !expanded" type="button" variant="ghost" size="sm" class="justify-self-start max-[679px]:min-h-12" :class="n === 3 && '@[1060px]:hidden'" @click="expand">
      <span class="@[1060px]:hidden">{{ t('today.waiting.more', { count: n - 2 }) }}</span>
      <span class="hidden @[1060px]:inline">{{ t('today.waiting.more', { count: n - 3 }) }}</span>
    </Button>
  </section>
</template>
