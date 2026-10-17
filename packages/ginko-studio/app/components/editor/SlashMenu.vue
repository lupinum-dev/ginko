<!-- The slash menu: a shadcn Command list in a floating panel at the cursor. The editor keeps the focus, so the
     keys (arrows, Enter, Esc) are handled by the Suggestion plugin in extensions.ts; the panel only draws. -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { injectConfigProviderContext } from 'reka-ui'
import type { SlashItem } from '@lupinum/ginko-editor'
import { Command, CommandGroup, CommandItem, CommandList } from '@studio/components/ui/command'
import type { SlashState } from './extensions.ts'

const props = defineProps<{ state: SlashState }>()
const { t } = useI18n()

const panel = ref<HTMLElement>()
// Where reka's own popups go: <body>, or the quick-task sheet's <dialog> (see TaskSheet), so the menu is not hidden beneath it.
const config = injectConfigProviderContext({})
const target = computed(() => config.teleportTo?.value ?? 'body')
const groups = computed(() => {
  const out: Array<{ name: string; items: Array<{ item: SlashItem; index: number }> }> = []
  props.state.items.forEach((item, index) => {
    let group = out.find((g) => g.name === item.group)
    if (!group) out.push(group = { name: item.group, items: [] })
    group.items.push({ item, index })
  })
  return out
})

async function place() {
  const el = panel.value
  const rect = props.state.rect?.()
  if (!el || !rect) return
  const { x, y } = await computePosition({ getBoundingClientRect: () => rect }, el, { strategy: 'fixed', placement: 'bottom-start', middleware: [offset(6), flip(), shift({ padding: 8 })] })
  el.style.left = `${x}px`
  el.style.top = `${y}px`
}

// After every change of the list (typing filters it) the panel is placed again and the selected item stays in view.
watch(() => [props.state.open, props.state.items, props.state.selected] as const, async () => {
  if (!props.state.open) return
  await nextTick()
  await place()
  panel.value?.querySelector('[data-selected-item="true"]')?.scrollIntoView({ block: 'nearest' })
}, { flush: 'post' })
</script>

<template>
  <Teleport :to="target">
    <!-- mousedown is prevented: a click on the list must not take the focus from the editor. -->
    <div v-if="state.open" ref="panel" class="fixed top-0 left-0 z-50 w-72 max-w-[calc(100vw-1rem)] rounded-md border bg-popover text-popover-foreground shadow-md" @mousedown.prevent>
      <p v-if="!state.items.length" class="p-3 text-center text-sm text-muted-foreground" role="status">{{ t('editor.slash.empty') }}</p>
      <Command v-else :highlight-on-hover="false" class="max-h-80">
        <CommandList class="max-h-80" :aria-label="t('editor.slash.insert')">
          <CommandGroup v-for="g in groups" :key="g.name" :heading="g.name">
            <CommandItem
              v-for="{ item, index } in g.items" :key="item.id" :value="item.id" :data-selected-item="index === state.selected" class="items-start"
              :class="index === state.selected && 'bg-accent text-accent-foreground'" @pointermove="state.selected = index" @select="state.choose(item)"
            >
              <span class="grid min-w-0 gap-0.5">
                <span>{{ item.label }}</span>
                <span class="truncate text-xs text-muted-foreground">{{ item.describe }}</span>
              </span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  </Teleport>
</template>
