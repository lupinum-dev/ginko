<!-- Search box, sort select and saved views of one area list (UI.md 10.6). A view is a name for the current search and
     sort (views.save); it shows as a chip above the list, and its menu removes it. No filter builder in 1.0. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { EllipsisIcon } from '@lucide/vue'
import { sortableFields } from '../utils/basics'
import { opErrorOf } from '../composables/useOps'
import { useStudioSite } from '../utils/labels'
import type { Brick } from '@lupinum/ginko'

export interface ListSort { field: string; dir: 'asc' | 'desc' }

const props = defineProps<{ slug: string; brickKey: string; brick: Brick }>()
const search = defineModel<string>('search', { default: '' })
const sort = defineModel<ListSort | undefined>('sort')
const { t } = useI18n()
const { shown } = useStudioSite()
const toast = useToast()

const fields = computed(() => sortableFields(props.brick))
/** One select value per field and direction: `price|asc`; empty = the area's own order. */
const choice = computed({
  get: () => (sort.value ? `${sort.value.field}|${sort.value.dir}` : ''),
  set: (value: string) => {
    const [field, dir] = value.split('|')
    sort.value = field ? { field, dir: dir === 'desc' ? 'desc' : 'asc' } : undefined
  },
})

const { data: views } = useConvexQuery(api.views.list, () => ({ site: props.slug, brick: props.brickKey }))
type View = NonNullable<typeof views.value>[number]
const same = (view: View) => (view.query.text ?? '') === search.value.trim() && view.query.sort?.field === sort.value?.field && view.query.sort?.dir === sort.value?.dir
function apply(view: View) {
  search.value = view.query.text ?? ''
  sort.value = view.query.sort
}

const saveView = useConvexMutation(api.views.save)
const removeView = useConvexMutation(api.views.remove)
const asking = ref(false)
const name = ref('')
const problem = ref('')
const canSave = computed(() => !!search.value.trim() || !!sort.value)
async function save() {
  problem.value = ''
  try {
    await saveView.mutate({ site: props.slug, brick: props.brickKey, name: name.value, query: { ...(search.value.trim() ? { text: search.value.trim() } : {}), ...(sort.value ? { sort: sort.value } : {}) } })
    asking.value = false
    name.value = ''
    toast.show(t('basics.views.saved'))
  } catch (error) {
    problem.value = opErrorOf(error).message
  }
}
async function remove(view: View) {
  try {
    await removeView.mutate({ site: props.slug, id: view.id })
    toast.show(t('basics.views.removeDone'))
  } catch (error) {
    toast.show(opErrorOf(error).message, { tone: 'err' })
  }
}
</script>

<template>
  <div class="mb-3 grid gap-2.5">
    <div class="flex flex-wrap items-center gap-2">
      <Input v-model="search" type="search" class="min-w-48 flex-1 sm:max-w-72" :aria-label="t('basics.views.searchLabel')" :placeholder="t('basics.views.searchPlaceholder')" />
      <NativeSelect v-model="choice" class="h-10 pointer-coarse:h-11" :aria-label="t('basics.views.sortLabel')">
        <NativeSelectOption value="">{{ t('basics.views.sortDefault') }}</NativeSelectOption>
        <template v-for="[key, field] in fields" :key="key">
          <NativeSelectOption :value="`${key}|asc`">{{ t('basics.views.sortAsc', { field: shown(field.label) }) }}</NativeSelectOption>
          <NativeSelectOption :value="`${key}|desc`">{{ t('basics.views.sortDesc', { field: shown(field.label) }) }}</NativeSelectOption>
        </template>
      </NativeSelect>
      <!-- Only with a search or sort to save: a disabled button took a whole row on phones and said nothing. -->
      <Button v-if="canSave" type="button" variant="outline" @click="asking = true">{{ t('basics.views.save') }}</Button>
    </div>
    <ul v-if="views?.length" class="m-0 flex list-none flex-wrap gap-1.5 p-0" :aria-label="t('basics.views.listLabel')">
      <li v-for="view in views" :key="view.id" class="inline-flex items-center rounded-full border">
        <Button type="button" variant="ghost" class="h-9 rounded-full pr-1.5 pl-3 pointer-coarse:h-11" :aria-pressed="same(view)" :class="same(view) && 'bg-accent'" @click="apply(view)">{{ view.name }}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button type="button" variant="ghost" size="icon" class="size-9 rounded-full pointer-coarse:size-11" :aria-label="t('basics.views.optionsFor', { name: view.name })"><EllipsisIcon class="size-4" aria-hidden="true" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem variant="destructive" class="min-h-9 pointer-coarse:min-h-11" @select="remove(view)">{{ t('basics.views.removeView') }}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    </ul>

    <Dialog v-model:open="asking">
      <DialogContent>
        <form class="grid gap-4" @submit.prevent="save">
          <DialogHeader>
            <DialogTitle>{{ t('basics.views.saveTitle') }}</DialogTitle>
            <DialogDescription>{{ t('basics.views.saveHelp') }}</DialogDescription>
          </DialogHeader>
          <div class="grid gap-1.5">
            <Label for="view-name" class="font-semibold">{{ t('basics.views.name') }}</Label>
            <Input id="view-name" v-model="name" maxlength="60" required :aria-invalid="problem ? 'true' : undefined" />
            <p v-if="problem" class="text-sm font-medium text-destructive" role="alert">{{ problem }}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="asking = false">{{ t('entry.cancel') }}</Button>
            <Button type="submit" :disabled="!name.trim()">{{ t('basics.views.saveConfirm') }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
