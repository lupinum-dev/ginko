<!-- Everything removed on the site, all areas, newest first, with the day it is deleted for good (UI.md 10.6). -->
<script setup lang="ts">
import { api } from '#convex/api'

const props = defineProps<{ slug: string; timeZone: string }>()
const { t, format } = useI18n()
const { data } = useConvexQuery(api.entries.trash, () => ({ site: props.slug }))
const ops = useOps(computed(() => props.slug))
</script>

<template>
  <section aria-labelledby="removed-title">
    <h1 id="removed-title" class="text-xl font-semibold tracking-tight">{{ t('basics.removed.title') }}</h1>
    <p v-if="data && !data.items.length" class="mt-3 text-muted-foreground">{{ t('basics.removed.empty') }}</p>
    <ul v-else class="mt-4 grid list-none gap-1.5 p-0">
      <li v-for="item in data?.items" :key="item.entry" class="flex items-center justify-between gap-3 rounded-md border border-dashed py-1.5 pr-2 pl-3.5">
        <span class="min-w-0">
          <span class="block truncate font-semibold">{{ item.label }}</span>
          <span class="block text-sm text-muted-foreground">{{ item.brickLabel }} · {{ t('basics.removed.until', { date: format.date(item.purgeAt, { timeZone, dateStyle: 'medium' }) }) }}</span>
        </span>
        <Button v-if="item.mayRestore" type="button" variant="outline" class="shrink-0" @click="ops.restoreEntry(item.entry, item.lifeRev, item.task)">{{ t('site.all.restore') }}</Button>
      </li>
    </ul>
  </section>
</template>
