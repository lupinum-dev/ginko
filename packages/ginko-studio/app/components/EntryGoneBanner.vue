<!-- Someone removed the entry while it was open (N1): the input stays in the form, and this banner offers
     what the person may do with it. Used by Alles bearbeiten and Schnell ändern, above the conflict panel. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { TrashIcon } from '@lucide/vue'
import { Alert, AlertDescription, AlertTitle } from '@studio/components/ui/alert'
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
  <Alert class="gap-y-2 rounded-lg border-0 bg-warning/10 p-4 [&>svg]:text-warning">
    <TrashIcon aria-hidden="true" />
    <AlertTitle class="line-clamp-none font-semibold">{{ dirty ? t('entry.gone.text') : t('entry.gone.textClean') }}</AlertTitle>
    <AlertDescription v-if="mayRestore || dirty" class="grid gap-2 text-foreground/80">
      <p v-if="dirty && !mayRestore && !mayCreate">{{ t('entry.gone.noRights') }}</p>
      <div v-if="mayRestore || dirty" class="flex flex-wrap gap-2 pt-1">
        <Button v-if="mayRestore" type="button" size="sm" :disabled="busy" @click="emit('restore', lifeRev)">{{ dirty ? t('entry.gone.restoreAndSave') : t('entry.gone.restore') }}</Button>
        <Button v-if="mayCreate && dirty" type="button" size="sm" :variant="mayRestore ? 'outline' : 'default'" :disabled="busy" @click="emit('saveAsNew')">{{ t('entry.gone.saveAsNew') }}</Button>
        <Button v-if="dirty" type="button" variant="ghost" size="sm" :disabled="busy" @click="emit('discard')">{{ t('entry.gone.discard') }}</Button>
      </div>
    </AlertDescription>
  </Alert>
</template>
