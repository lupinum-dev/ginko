<!-- The remove rule (UI.md 10.3): an unused file is confirmed and goes to the trash for 30 days; a used
     file cannot be removed, the dialog says where it is used and offers no destructive button. -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import type { UsedIn } from '../../composables/useFilesLibrary'
import { useStudioSite } from '../../utils/labels'
import { fieldsText, placesOf } from './util'

export interface RemoveItem { id: string; name: string; used: boolean; usedIn: UsedIn[] }

const props = defineProps<{ open: boolean; slug: string; items: RemoveItem[]; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; confirm: [] }>()
const { t } = useI18n()
const { shown } = useStudioSite()

const blocked = computed(() => props.items.filter((item) => item.used))
const title = computed(() => (blocked.value.length ? t('files.removeUsed') : t('files.remove')))
const confirmText = computed(() => (props.items.length === 1 ? t('files.removeConfirm', { name: props.items[0]!.name }) : t('files.removeConfirmMany', { count: props.items.length })))
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg" :aria-describedby="blocked.length ? undefined : 'remove-text'">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="!blocked.length" id="remove-text">{{ confirmText }}</DialogDescription>
      </DialogHeader>

      <div v-if="blocked.length" class="grid max-h-80 gap-4 overflow-y-auto" data-testid="remove-used">
        <section v-for="item in blocked" :key="item.id" class="grid gap-1">
          <p class="text-sm font-medium [overflow-wrap:anywhere]">{{ t('files.removeUsedMsg', { name: item.name, count: placesOf(item.usedIn) }) }}</p>
          <ul class="grid gap-1 text-sm">
            <li v-for="use in item.usedIn" :key="use.entry">
              <span v-if="use.deleted" class="text-muted-foreground">{{ use.title }} · {{ fieldsText(use, shown) }} {{ t('files.deletedEntry') }}</span>
              <NuxtLink v-else :to="`/s/${slug}/all/${use.brick}/${use.entry}`" class="text-primary underline underline-offset-4">{{ use.title }}</NuxtLink>
              <span v-if="!use.deleted" class="text-muted-foreground"> · {{ fieldsText(use, shown) }}</span>
            </li>
          </ul>
        </section>
      </div>
      <p v-if="error" class="text-sm font-medium text-destructive" role="alert">{{ error }}</p>

      <DialogFooter>
        <Button type="button" variant="outline" @click="emit('update:open', false)">{{ blocked.length ? t('files.close') : t('files.cancel') }}</Button>
        <Button v-if="!blocked.length" type="button" variant="destructive" :disabled="busy" @click="emit('confirm')">{{ t('files.remove') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
