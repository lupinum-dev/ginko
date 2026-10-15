<!-- Everything removed on the site, all areas, newest first, with the day it is deleted for good (UI.md 10.6);
     older ones load with "Mehr anzeigen".
     Owners and admins can also delete an entry for good now ("Jetzt löschen"), after one question: it frees the
     trash at once and cannot be undone. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { opErrorOf } from '../composables/useOps'

const props = defineProps<{ slug: string; timeZone: string }>()
const { t, format } = useI18n()
const PAGE = 50
const list = useConvexPaginatedQuery(api.entries.trash, () => ({ site: props.slug }), { initialNumItems: PAGE })
const ops = useOps(computed(() => props.slug))

type Item = NonNullable<typeof list.data.value>[number]
const asking = ref(false)
/** The entry the question is about; kept after closing, so the title stays while the dialog fades out. */
const target = ref<Item>()
function ask(item: Item) {
  target.value = item
  asking.value = true
}
const busy = ref(false)
async function purge() {
  const item = target.value
  if (!item) return
  busy.value = true
  try {
    await ops.purgeEntry(item.entry, item.lifeRev, item.label)
  } finally {
    busy.value = false
    asking.value = false
  }
}
</script>

<template>
  <section aria-labelledby="removed-title">
    <h1 id="removed-title" class="text-xl font-semibold tracking-tight">{{ t('basics.removed.title') }}</h1>
    <p v-if="list.error.value" class="mt-3 font-medium text-destructive" role="alert">{{ opErrorOf(list.error.value, t('basics.loadFailed')).message }}</p>
    <p v-if="list.status.value === 'success' && !list.data.value?.length" class="mt-3 text-muted-foreground">{{ t('basics.removed.empty') }}</p>
    <ul v-else class="mt-4 grid list-none gap-1.5 p-0">
      <li v-for="item in list.data.value" :key="item.entry" class="flex items-center justify-between gap-3 rounded-md border border-dashed py-1.5 pr-2 pl-3.5">
        <span class="min-w-0">
          <span class="block truncate font-semibold">{{ item.label }}</span>
          <span class="block text-sm text-muted-foreground">{{ item.brickLabel }} · {{ t('basics.removed.until', { date: format.date(item.purgeAt, { timeZone, dateStyle: 'medium' }) }) }}</span>
        </span>
        <span class="flex shrink-0 flex-wrap justify-end gap-1">
          <Button v-if="item.mayPurge" type="button" variant="ghost" class="text-destructive hover:text-destructive" :aria-label="t('basics.removed.deleteNowNamed', { title: item.label })" @click="ask(item)">{{ t('basics.removed.deleteNow') }}</Button>
          <Button v-if="item.mayRestore" type="button" variant="outline" @click="ops.restoreEntry(item.entry, item.lifeRev, item.task)">{{ t('site.all.restore') }}</Button>
        </span>
      </li>
    </ul>
    <Button v-if="list.canLoadMore.value || list.isLoadingMore.value" type="button" variant="secondary" class="mt-3" :disabled="!list.canLoadMore.value" @click="list.loadMore(PAGE)">{{ t('basics.loadMore') }}</Button>
    <Dialog v-model:open="asking">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ t('basics.removed.confirmTitle', { title: target?.label ?? '' }) }}</DialogTitle>
          <DialogDescription>{{ t('basics.removed.confirmBody') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" @click="asking = false">{{ t('entry.cancel') }}</Button>
          <Button type="button" variant="destructive" :disabled="busy" @click="purge">{{ t('basics.removed.confirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
