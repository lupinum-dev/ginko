<!-- "Eintrag entfernen" (UI.md 4): the entry goes to the trash for 30 days. When other entries point at it
     (an author used by blog posts), the dialog lists them and asks again: there it is missing on the website
     until it is restored. Used by Alles bearbeiten and by the remove task of Schnell ändern. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { FunctionReturnType } from 'convex/server'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import UsedInList from './UsedInList.vue'

export type EntryUses = FunctionReturnType<typeof api.entries.usedBy>

const props = defineProps<{
  open: boolean
  slug: string
  /** The entry's title, as in the list. */
  title: string
  /** The entries that point at it; undefined while they are being looked up. */
  uses: EntryUses | undefined
  busy?: boolean
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; confirm: [] }>()
const { t } = useI18n()
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('entry.remove.title') }}</DialogTitle>
        <DialogDescription v-if="!uses">{{ t('entry.remove.checking') }}</DialogDescription>
        <DialogDescription v-else-if="uses.length">{{ t('entry.remove.usedIn', { title, count: uses.length }) }}</DialogDescription>
        <DialogDescription v-else>{{ t('entry.remove.text', { title }) }}</DialogDescription>
      </DialogHeader>
      <div v-if="uses?.length" class="max-h-80 overflow-y-auto">
        <UsedInList :slug="slug" :uses="uses" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" @click="emit('update:open', false)">{{ t('entry.cancel') }}</Button>
        <Button type="button" variant="destructive" :disabled="busy || !props.uses" @click="emit('confirm')">{{ uses?.length ? t('entry.remove.confirmAnyway') : t('entry.remove.confirm') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
