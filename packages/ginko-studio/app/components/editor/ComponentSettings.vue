<!-- The form inside the settings popover of a component block: one field per prop of the registry entry.
     A change that passes the core's check is handed out at once (`update`); one that does not shows its
     message under the field and is not applied. With `requiredFirst` (right after insert) the required props
     come first and the others wait behind "Weitere Einstellungen". -->
<script setup lang="ts">
import { computed, reactive, ref, useId } from 'vue'
import { useI18n } from '#imports'
import { coreMessage, type ComponentRegistry } from '@lupinum/ginko'
import { aliasOf, propFields, propProblemMessage, readProp, writeProp, type ComponentProps, type PropField as PropFieldType, type PropValue } from '@lupinum/ginko-editor'
import { ChevronDown } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@studio/components/ui/collapsible'
import PropField from './PropField.vue'
import { useStudioSite } from '../../utils/labels'

const props = defineProps<{ tag: string; registry: ComponentRegistry; values: ComponentProps; requiredFirst?: boolean; titleId?: string }>()
const emit = defineEmits<{ update: [values: ComponentProps]; convert: [tag: string, values: ComponentProps]; remove: [] }>()

const { shown: labelText } = useStudioSite()
const { t, locale } = useI18n()
const def = computed(() => props.registry[props.tag])
// A short form (`warning`) offers the prop it stands for (`Art`) first; choosing one turns the block into the long form.
const alias = computed(() => aliasOf(props.registry, props.tag))
const fields = computed<Array<[string, PropFieldType]>>(() => {
  const own = def.value ? propFields(def.value) : []
  return alias.value ? [[alias.value.prop, alias.value.field], ...own] : own
})
const shown = computed(() => (alias.value ? { ...props.values, [alias.value.prop]: alias.value.value } : props.values))
const required = computed(() => fields.value.filter(([, f]) => !f.optional))
const optional = computed(() => fields.value.filter(([, f]) => f.optional))
const more = ref(!props.requiredFirst)
const moreId = useId()

const errors = reactive<Record<string, string | undefined>>({})

function change(key: string, field: PropFieldType, value: PropValue) {
  // A cleared optional text is a prop that is not set, not an empty one.
  const next = value === '' && field.optional ? undefined : value
  if (alias.value && key === alias.value.prop) {
    emit('convert', alias.value.tag, writeProp(field, props.values, key, next))
    return
  }
  const problem = propProblemMessage(props.registry, props.tag, key, next)
  errors[key] = problem && coreMessage(locale.value, problem.key, problem.params)
  if (problem) return
  emit('update', writeProp(field, props.values, key, next))
}
</script>

<template>
  <div class="grid gap-4">
    <h2 :id="titleId" class="text-sm font-semibold">{{ def ? labelText(def.label) : tag }}</h2>

    <p v-if="!fields.length" class="text-sm text-muted-foreground">{{ t('editor.block.noSettings') }}</p>

    <section v-if="required.length" class="grid gap-3" :aria-label="t('editor.block.required')">
      <p class="text-xs font-medium text-muted-foreground">{{ t('editor.block.required') }}</p>
      <PropField
        v-for="[key, field] in required" :key="key" :name="key" :field="field" :model-value="readProp(field, shown, key)" :error="errors[key]"
        @change="change(key, field, $event)"
      />
    </section>

    <Collapsible v-if="required.length && optional.length" v-model:open="more" class="grid gap-3">
      <CollapsibleTrigger as-child>
        <Button variant="ghost" size="sm" class="justify-between px-2" :aria-controls="moreId">
          {{ t('editor.block.more') }} <ChevronDown class="transition-transform" :class="more ? 'rotate-180' : ''" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent :id="moreId" class="grid gap-3">
        <PropField
          v-for="[key, field] in optional" :key="key" :name="key" :field="field" :model-value="readProp(field, shown, key)" :error="errors[key]"
          @change="change(key, field, $event)"
        />
      </CollapsibleContent>
    </Collapsible>
    <template v-else>
      <PropField
        v-for="[key, field] in optional" :key="key" :name="key" :field="field" :model-value="readProp(field, shown, key)" :error="errors[key]"
        @change="change(key, field, $event)"
      />
    </template>

    <div class="border-t pt-3">
      <Button type="button" variant="ghost" size="sm" class="-ml-2 text-destructive hover:text-destructive" @click="emit('remove')">{{ t('editor.block.remove') }}</Button>
    </div>
  </div>
</template>
