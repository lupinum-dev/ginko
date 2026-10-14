<!-- Where something is used (UI.md 10.3): one line per entry with a link to it and the fields it sits in.
     Shared by the Files library's remove dialog and the entry remove dialog. -->
<script setup lang="ts">
import type { Label } from '@lupinum/ginko'
import { useI18n } from '#imports'
import { useStudioSite } from '../utils/labels'
import { fieldsText } from './files/util'

defineProps<{
  slug: string
  uses: readonly { entry: string; brick: string; title: string; paths: string[]; fieldLabels: (Label | null)[]; deleted: boolean }[]
}>()
const { t } = useI18n()
const { shown } = useStudioSite()
</script>

<template>
  <ul class="grid gap-1 text-sm">
    <li v-for="use in uses" :key="use.entry">
      <span v-if="use.deleted" class="text-muted-foreground">{{ use.title }} · {{ fieldsText(use, shown) }} {{ t('files.deletedEntry') }}</span>
      <NuxtLink v-else :to="`/s/${slug}/all/${use.brick}/${use.entry}`" class="text-primary underline underline-offset-4">{{ use.title }}</NuxtLink>
      <span v-if="!use.deleted" class="text-muted-foreground"> · {{ fieldsText(use, shown) }}</span>
    </li>
  </ul>
</template>
