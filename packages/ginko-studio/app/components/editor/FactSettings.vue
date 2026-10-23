<!-- The panel of a fact chip (`:fact{name="practice.price"}`): what the website shows there now and from when a planned
     value takes over, where the value is kept (with a link that opens it in a new tab, so the text stays open), another
     fact to show instead, and Entfernen. The facts are grouped by the brick they come from, each with its value. -->
<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from '#imports'
import { FACT_TAG, type ComponentRegistry } from '@lupinum/ginko/internal'
import { SquareArrowOutUpRightIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { Label } from '@studio/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@studio/components/ui/select'
import type { StudioFact } from '../../utils/facts'
import { formatDay } from '../../utils/content'
import { useStudioSite } from '../../utils/labels'

const props = defineProps<{
  name: string
  registry: ComponentRegistry
  /** The site's facts in the text's language; undefined while they load. */
  facts: readonly StudioFact[] | undefined
  slug: string
  titleId: string
}>()
const emit = defineEmits<{ pick: [name: string]; remove: [] }>()

const { t, format } = useI18n()
const { shown } = useStudioSite()
const pickerId = useId()

/** The facts the site offers, in the order of `facts` in its config, with their field label. */
const offered = computed(() => {
  const name = props.registry[FACT_TAG]?.props.name
  return name?.type === 'choice' ? name.options.map((option) => ({ name: String(option.value), label: shown(option.label) })) : []
})
/** The label of the brick a fact comes from ("Praxis"); its key while the facts load. */
const brickLabel = (brick: string) => {
  const label = props.facts?.find((fact) => fact.brick === brick)?.brickLabel
  return label === undefined ? brick : shown(label)
}

const current = computed(() => props.facts?.find((fact) => fact.name === props.name))
const label = computed(() => offered.value.find((o) => o.name === props.name)?.label ?? props.name)
const brick = computed(() => props.name.split('.')[0] ?? '')
const link = computed(() => (current.value?.entry ? `/s/${props.slug}/all/${current.value.brick}?field=${encodeURIComponent(current.value.field)}` : undefined))
const groups = computed(() => {
  const out: { brick: string; label: string; options: { name: string; label: string; value?: string }[] }[] = []
  for (const option of offered.value) {
    const key = option.name.split('.')[0]!
    let group = out.find((g) => g.brick === key)
    if (!group) out.push(group = { brick: key, label: brickLabel(key), options: [] })
    group.options.push({ ...option, value: props.facts?.find((fact) => fact.name === option.name)?.text })
  }
  return out
})
</script>

<template>
  <div class="grid gap-4">
    <div class="grid gap-0.5">
      <h2 :id="titleId" class="text-sm font-semibold">{{ label }}</h2>
      <p class="text-xs text-muted-foreground">{{ t('editor.fact.from', { brick: brickLabel(brick) }) }}</p>
    </div>

    <div class="grid gap-1 rounded-md bg-muted px-3 py-2.5" aria-live="polite">
      <p class="text-xs text-muted-foreground">{{ t('editor.fact.shows') }}</p>
      <p v-if="facts === undefined" class="text-sm text-muted-foreground">…</p>
      <p v-else-if="current?.text" class="text-base font-semibold break-words">{{ current.text }}</p>
      <p v-else class="text-sm">{{ t('editor.fact.empty', { brick: brickLabel(brick) }) }}</p>
      <p v-if="current?.next" class="text-xs text-muted-foreground">{{ t('editor.fact.next', { date: formatDay(current.next.from, format), value: current.next.text }) }}</p>
    </div>
    <p class="text-xs text-muted-foreground">{{ t('editor.fact.follows') }}</p>

    <a v-if="link" :href="link" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 justify-self-start text-sm font-medium text-primary underline underline-offset-4">
      {{ t('editor.fact.change', { brick: brickLabel(brick) }) }}
      <SquareArrowOutUpRightIcon class="size-3.5" aria-hidden="true" />
      <span class="sr-only">{{ t('editor.fact.newTab') }}</span>
    </a>

    <div v-if="offered.length > 1" class="grid gap-1.5">
      <Label :for="pickerId" class="text-xs font-medium text-muted-foreground">{{ t('editor.fact.other') }}</Label>
      <Select :model-value="name" @update:model-value="(next) => { if (typeof next === 'string' && next !== name) emit('pick', next) }">
        <SelectTrigger :id="pickerId" class="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectGroup v-for="group in groups" :key="group.brick">
            <SelectLabel>{{ group.label }}</SelectLabel>
            <SelectItem v-for="option in group.options" :key="option.name" :value="option.name">
              {{ option.label }}<span v-if="option.value" class="text-muted-foreground"> · {{ option.value }}</span>
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>

    <div class="border-t pt-3">
      <Button type="button" variant="ghost" size="sm" class="-ml-2 text-destructive hover:text-destructive" @click="emit('remove')">{{ t('editor.block.remove') }}</Button>
    </div>
  </div>
</template>
