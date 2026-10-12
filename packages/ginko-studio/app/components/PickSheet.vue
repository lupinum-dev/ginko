<!-- Choose the entry for a pick task (UI.md 3): search by name, grouped by the first choice field. -->
<script setup lang="ts">
import type { Brick, Locale } from '@lupinum/ginko'
import { ordered } from '@lupinum/ginko/internal'
import type { Entry } from '../composables/useSiteData'
import { displayValue, groupField, searchable, titleOf, type Task } from '../utils/content'
import { useStudioSite } from '../utils/labels'
import { Input } from '@studio/components/ui/input'
import { XIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { SHEET_DIALOG } from '../utils/sheetDialog'

const props = defineProps<{ brick: Brick; task: Task; entries: Entry[]; main: Locale }>()
const emit = defineEmits<{ pick: [entry: Entry]; close: [] }>()

const { shown } = useStudioSite()
const { t, format } = useI18n()
const term = ref('')
const dialog = ref<HTMLDialogElement | null>(null)
const search = ref<{ $el: HTMLElement } | null>(null)
onMounted(() => { dialog.value?.showModal(); search.value?.$el.focus() })

const group = computed(() => groupField(props.brick))
// A price next to each name, so "Preis ändern" shows what it changes: the money field the task edits, else the
// first one in form order.
const moneyKey = computed(() => {
  const money = ordered(props.brick.fields).filter(([, f]) => f.type === 'money' && !f.retired).map(([k]) => k)
  const edited = props.task.kind === 'edit' ? money.find((k) => props.task.kind === 'edit' && props.task.fields.includes(k)) : undefined
  return edited ?? money[0]
})
const priceOf = (e: Entry) => {
  const key = moneyKey.value
  return key && e.data[key] != null ? displayValue(props.brick.fields[key]!, e.data[key], props.main, { t, format }) : ''
}
const matches = computed(() => {
  const t = searchable(term.value.trim())
  return props.entries.filter((e) => !t || searchable(titleOf(props.brick, e.data, props.main)).includes(t))
})
const groups = computed(() => {
  const g = group.value
  if (!g) return [{ label: '', items: matches.value }]
  return g.field.options
    .map((o) => ({ label: shown(o.label), items: matches.value.filter((e) => e.data[g.key] === o.value) }))
    .filter((x) => x.items.length)
})
</script>

<template>
  <dialog ref="dialog" :class="[SHEET_DIALOG, 'h-[92dvh] min-[900px]:h-dvh']" aria-labelledby="pick-title" @cancel.prevent="emit('close')">
    <div class="grid h-full grid-rows-[auto_auto_1fr]">
      <header class="flex items-center justify-between gap-3 bg-card pt-4 pr-4 pb-2 pl-5">
        <h2 id="pick-title" class="text-lg font-semibold">{{ shown(task.label) }}</h2>
        <Button type="button" variant="ghost" size="icon" class="flex-none rounded-full" :aria-label="t('entry.close')" @click="emit('close')">
          <XIcon aria-hidden="true" />
        </Button>
      </header>
      <div class="border-b bg-card px-4 pt-2 pb-3">
        <label for="pick-search" class="sr-only">{{ t('entry.pick.search') }}</label>
        <Input id="pick-search" ref="search" v-model="term" type="search" :placeholder="t('entry.pick.search')" autocomplete="off" />
      </div>
      <div class="overflow-auto px-4 pt-2 pb-6">
        <p v-if="!matches.length" class="px-1 py-4 text-muted-foreground">{{ t('entry.pick.empty') }}</p>
        <section v-for="g in groups" :key="g.label">
          <h3 v-if="g.label" class="mx-1 mt-4 mb-1.5 text-sm font-semibold text-muted-foreground">{{ g.label }}</h3>
          <ul class="grid gap-1">
            <li v-for="e in g.items" :key="e._id">
              <button type="button" class="flex min-h-13 w-full items-center justify-between gap-3 rounded-md border bg-card px-3.5 py-2.5 text-left font-semibold outline-none hover:border-primary hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/80" @click="emit('pick', e)">
                <span class="min-w-0">{{ titleOf(brick, e.data, main) }}</span>
                <span v-if="priceOf(e)" class="flex-none font-normal text-muted-foreground tabular-nums">{{ priceOf(e) }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </dialog>
</template>
