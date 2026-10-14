<!-- Someone removed the entry while it was open (N1): the input stays in the form, and this banner offers
     what the person may do with it. Used by Alles bearbeiten and Schnell ändern, above the conflict panel. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import type { Entry } from '../composables/useSiteData'

const props = defineProps<{
  site: string
  brickKey: string
  /** The removed entry, as last seen. */
  entry: Entry
  /** The person typed something not saved yet; without input there is nothing to save or discard. */
  dirty: boolean
  busy: boolean
  /** Restoring belongs to the remove right. */
  mayRestore: boolean
  /** "Als neuen Eintrag speichern" (Alles bearbeiten with the create right). */
  mayCreate?: boolean
}>()
const emit = defineEmits<{ restore: [lifeRev: number]; saveAsNew: []; discard: [] }>()
const { t } = useI18n()

// A restore needs the entry's lifeRev after the removal. The trash list has it; an entry beyond its 100
// newest removals is missing there, and a removal raises lifeRev by one.
const { data: removed } = useConvexQuery(api.entries.removed, () => (props.mayRestore ? { site: props.site, brick: props.brickKey } : 'skip'))
const lifeRev = computed(() => removed.value?.find((e) => e._id === props.entry._id)?.lifeRev ?? props.entry.lifeRev + 1)
</script>

<template>
  <div class="grid gap-2 rounded-md bg-warning/10 p-3" role="alert">
    <p><strong>{{ dirty ? t('entry.gone.text') : t('entry.gone.textClean') }}</strong></p>
    <p v-if="dirty && !mayRestore && !mayCreate">{{ t('entry.gone.noRights') }}</p>
    <div v-if="mayRestore || dirty" class="flex flex-wrap gap-2">
      <Button v-if="mayRestore" type="button" :disabled="busy" @click="emit('restore', lifeRev)">{{ dirty ? t('entry.gone.restoreAndSave') : t('entry.gone.restore') }}</Button>
      <Button v-if="mayCreate && dirty" type="button" :variant="mayRestore ? 'outline' : 'default'" :disabled="busy" @click="emit('saveAsNew')">{{ t('entry.gone.saveAsNew') }}</Button>
      <Button v-if="dirty" type="button" variant="ghost" :disabled="busy" @click="emit('discard')">{{ t('entry.gone.discard') }}</Button>
    </div>
  </div>
</template>
