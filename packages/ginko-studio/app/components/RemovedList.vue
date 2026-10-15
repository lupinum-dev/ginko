<!-- Everything removed on the site, all areas, newest first, with the day it is deleted for good (UI.md 10.6);
     older ones load with "Mehr anzeigen". A line under the heading says that a full trash deletes the oldest early.
     Owners and admins can also delete an entry for good now ("Jetzt löschen"), after one question: it frees the
     trash at once and cannot be undone. The question lists the entries that still use it (N5): there it is missing
     on the website afterwards. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { SITE_BUDGET, type Schema } from '@lupinum/ginko/internal'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { opErrorOf } from '../composables/useOps'
import { sizeText } from '../utils/size'
import UsedInList from './UsedInList.vue'
import { useStudioSite } from '../utils/labels'

const props = defineProps<{ slug: string; schema: Schema | undefined }>()
const { t, format } = useI18n()
const { shown } = useStudioSite()
const timeZone = computed(() => props.schema?.timeZone ?? 'Europe/Vienna')
const PAGE = 50
// Loaded in the browser only: a page of large removed entries hits the read limit and Convex asks to split it. The
// live client splits it; server rendering cannot and would show "could not be loaded" until the browser took over.
const list = useConvexPaginatedQuery(api.entries.trash, () => ({ site: props.slug }), { initialNumItems: PAGE, server: false })
const ops = useOps(computed(() => props.slug))

type Item = NonNullable<typeof list.data.value>[number]
/** The area in the Studio's language; the server names it in the site's main language. */
const areaOf = (item: Item) => {
  const def = props.schema?.bricks[item.brick]
  return def ? shown(def.label) : item.brickLabel
}
const asking = ref(false)
/** The entry the question is about; kept after closing, so the title stays while the dialog fades out. */
const target = ref<Item>()
function ask(item: Item) {
  target.value = item
  asking.value = true
}
/** Entries that still point at the target, looked up only while the question is open; a failed lookup only warns less. */
const usesQuery = useConvexQuery(api.entries.usedBy, () => (asking.value && target.value ? { site: props.slug, entry: target.value.entry } : 'skip'))
const uses = computed(() => (usesQuery.error.value ? [] : usesQuery.data.value))
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
    <p class="mt-1 text-sm text-muted-foreground">{{ t('basics.removed.keeps', { limit: sizeText(SITE_BUDGET.trashBytes, format.number) }) }}</p>
    <p v-if="list.error.value" class="mt-3 font-medium text-destructive" role="alert">{{ opErrorOf(list.error.value, t('basics.loadFailed')).message }}</p>
    <p v-if="list.status.value === 'success' && !list.data.value?.length" class="mt-3 text-muted-foreground">{{ t('basics.removed.empty') }}</p>
    <ul v-else class="mt-4 grid list-none gap-1.5 p-0">
      <li v-for="item in list.data.value" :key="item.entry" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-md border border-dashed py-1.5 pr-2 pl-3.5 sm:flex-nowrap">
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold">{{ item.label }}</span>
          <span class="block text-sm text-muted-foreground">{{ areaOf(item) }} · {{ t('basics.removed.until', { date: format.date(item.purgeAt, { timeZone, dateStyle: 'medium' }) }) }}</span>
        </span>
        <!-- Phones: the buttons move under the title and date, so the title keeps the full width. -->
        <span class="flex shrink-0 flex-wrap gap-1 max-sm:basis-full sm:justify-end">
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
        <p v-if="!uses" class="text-sm text-muted-foreground">{{ t('entry.remove.checking') }}</p>
        <div v-else-if="uses.length" class="grid gap-1 text-sm">
          <p>{{ t('basics.removed.usedIn') }}</p>
          <div class="max-h-80 overflow-y-auto">
            <UsedInList :slug="slug" :uses="uses" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" @click="asking = false">{{ t('entry.cancel') }}</Button>
          <Button type="button" variant="destructive" :disabled="busy || !uses" @click="purge">{{ t('basics.removed.confirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
