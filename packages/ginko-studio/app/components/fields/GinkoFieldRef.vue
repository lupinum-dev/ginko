<!-- Points to entries of another brick (SPEC 2.2: stores the entry ID, or a list of IDs with `multiple`).
     A combobox with search lists the target's entries by title. Several: chips plus the combobox, `max`
     respected. An ID whose entry is gone shows "Eintrag gibt es nicht mehr" with a remove button. -->
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from '#imports'
import { CheckIcon, ChevronsUpDownIcon, PlusIcon, XIcon } from '@lucide/vue'
import type { Field, Json } from '@lupinum/ginko'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@studio/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@studio/components/ui/popover'
import { useRefs } from './refs'
import { useStudioSite } from '../../utils/labels'

const props = defineProps<{ id: string; field: Extract<Field, { type: 'ref' }>; modelValue: Json | undefined; invalid: boolean; describedBy?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()

const { shown } = useStudioSite()
const { t } = useI18n()
const refs = useRefs()
const options = refs.options(() => props.field.to)
const titleById = computed(() => new Map(options.value.map((o) => [o.id, o.title])))
const ids = computed<string[]>(() => (props.field.multiple ? (Array.isArray(props.modelValue) ? (props.modelValue as string[]) : []) : typeof props.modelValue === 'string' && props.modelValue ? [props.modelValue] : []))
const full = computed(() => props.field.multiple && props.field.max !== undefined && ids.value.length >= props.field.max)
const open = ref(false)
/** Entries that can still be picked: in "several" mode the chosen ones are not offered twice. */
const pickable = computed(() => options.value.filter((o) => !ids.value.includes(o.id)))
const list = computed(() => (props.field.multiple ? pickable.value : options.value))
const target = computed(() => refs.brickLabel(props.field.to))

function pick(id: string) {
  open.value = false
  if (props.field.multiple) emit('update:modelValue', [...ids.value, id])
  else emit('update:modelValue', id)
}
function remove(id: string) {
  if (props.field.multiple) {
    const next = ids.value.filter((x) => x !== id)
    emit('update:modelValue', props.field.optional || next.length ? next : [])
  } else emit('update:modelValue', undefined)
  // The pressed button went with what it removed; the combobox is there afterwards (no longer full, no longer gone).
  nextTick(() => document.getElementById(props.id)?.focus())
}
const single = computed(() => ids.value[0])
const singleMissing = computed(() => single.value !== undefined && !titleById.value.has(single.value))
</script>

<template>
  <div class="grid gap-2" role="group" :aria-labelledby="`${id}-label`">
    <ul v-if="field.multiple && ids.length" class="flex flex-wrap gap-2" :aria-label="shown(field.label)">
      <li v-for="chosen in ids" :key="chosen">
        <Badge :variant="titleById.has(chosen) ? 'secondary' : 'outline'" :class="['h-8 gap-1 pr-1 pl-3 text-sm pointer-coarse:h-11', titleById.has(chosen) ? '' : 'border-destructive text-destructive']">
          {{ titleById.get(chosen) ?? t('fields.ref.gone') }}
          <button type="button" class="grid size-6 place-items-center rounded-full hover:bg-foreground/10 pointer-coarse:size-9" :aria-label="t('fields.ref.removeChip', { title: titleById.get(chosen) ?? t('fields.ref.gone') })" @click="remove(chosen)">
            <XIcon class="size-3.5" aria-hidden="true" />
          </button>
        </Badge>
      </li>
    </ul>

    <div v-if="!field.multiple && singleMissing" class="flex items-center gap-2">
      <p :id="id" class="flex-1 text-sm font-medium text-destructive" :aria-describedby="describedBy">{{ t('fields.ref.gone') }}</p>
      <Button type="button" variant="outline" @click="remove(single!)">{{ t('fields.remove') }}</Button>
    </div>

    <p v-if="field.multiple && field.max !== undefined" class="text-sm text-muted-foreground">{{ full ? t('fields.ref.full', { max: field.max }) : t('fields.ref.upTo', { max: field.max }) }}</p>

    <div v-if="!(field.multiple ? full : singleMissing)" class="flex items-center gap-2">
      <Popover v-model:open="open">
        <PopoverTrigger as-child>
          <Button :id="id" type="button" variant="outline" role="combobox" :aria-expanded="open" aria-haspopup="listbox" :aria-invalid="invalid" :aria-describedby="describedBy" class="min-w-0 flex-1 justify-between font-normal sm:max-w-sm">
            <span class="truncate">
              <template v-if="field.multiple"><PlusIcon class="mr-1 inline size-4" aria-hidden="true" />{{ t('fields.ref.add') }}</template>
              <template v-else>{{ single ? titleById.get(single) : t('fields.ref.choose', { target }) }}</template>
            </span>
            <ChevronsUpDownIcon class="size-4 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-(--reka-popover-trigger-width) min-w-64 p-0" align="start">
          <Command>
            <CommandInput :placeholder="t('fields.ref.search', { target })" />
            <CommandList>
              <CommandEmpty>{{ t('fields.ref.nothing') }}</CommandEmpty>
              <CommandGroup>
                <CommandItem v-for="o in list" :key="o.id" :value="o.id" class="min-h-10 pointer-coarse:min-h-11" @select="pick(o.id)">
                  <CheckIcon :class="['size-4', single === o.id ? 'opacity-100' : 'opacity-0']" aria-hidden="true" />
                  {{ o.title }}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button v-if="!field.multiple && single && field.optional" type="button" variant="ghost" @click="remove(single)">{{ t('fields.clear') }}</Button>
    </div>
  </div>
</template>
