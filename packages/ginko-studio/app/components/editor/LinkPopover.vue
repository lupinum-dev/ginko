<!-- The address of a link: opened from the toolbar button, Mod+K or the bubble menu. The slot is the anchor
     (the toolbar's link button). One field takes both: typing a title lists the site's own pages (LinkTargetList), and
     a picked page is stored as its route link; anything else is a typed address. Every address goes through the core's
     rule (`isSafeHref`) before it is set. -->
<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from '#imports'
import { ListboxFilter } from 'reka-ui'
import { isSafeHref } from '@lupinum/ginko/internal'
import { normalizeHref } from '@lupinum/ginko-editor'
import type { Editor } from '@tiptap/core'
import { Button } from '@studio/components/ui/button'
import { Command } from '@studio/components/ui/command'
import { Label } from '@studio/components/ui/label'
import { Popover, PopoverAnchor, PopoverContent } from '@studio/components/ui/popover'
import LinkTargetList, { type LinkTarget } from './LinkTargetList.vue'

const props = defineProps<{ editor: Editor }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()

const inputId = useId()
const errorId = useId()
/** What the field shows: a typed address or search, or the title of the picked page. */
const text = ref('')
/** A page of the site, picked from the list or already linked: its route link, shown by its title. */
const target = ref<LinkTarget | null>(null)
const error = ref('')
const hasLink = ref(false)
const input = ref<{ $el?: Element } | null>()

watch(open, (isOpen) => {
  if (!isOpen) return
  hasLink.value = props.editor.isActive('link')
  const current = hasLink.value ? String(props.editor.getAttributes('link').href ?? '') : ''
  // A route link shows as written until the list names it (`found`).
  target.value = current.startsWith('$') ? { href: current, label: current, area: '' } : null
  text.value = current
  error.value = ''
  nextTick(() => {
    const el = input.value?.$el
    if (el instanceof HTMLInputElement) el.select()
  })
})

/** A typed address, mail or phone is no search: the list stays away for it. */
const ADDRESS = /^(https?:|mailto:|tel:|www\.|[/#$])|@|^\S+\.[a-z]{2,}(\/|$)/i
const query = computed(() => (target.value || ADDRESS.test(text.value.trim()) ? '' : text.value))

function onText(value: string) {
  text.value = value
  target.value = null
  error.value = ''
}
function found(hit: LinkTarget) {
  if (target.value?.href !== hit.href || text.value !== target.value.label) return
  target.value = hit
  text.value = hit.label
}
function pick(hit: LinkTarget) {
  target.value = hit
  text.value = hit.label
  apply()
}

function apply() {
  const typed = text.value.trim()
  if (!typed && hasLink.value) return remove()
  const address = target.value?.href ?? normalizeHref(typed)
  if (!typed || !isSafeHref(address)) { error.value = t('editor.link.refused'); return }
  const chain = props.editor.chain().focus()
  if (hasLink.value) chain.extendMarkRange('link').setLink({ href: address }).run()
  // Without selected text the link brings its own: a page's title, else the address.
  else if (props.editor.state.selection.empty) chain.insertContent({ type: 'text', text: target.value?.label ?? address, marks: [{ type: 'link', attrs: { href: address } }] }).run()
  else chain.setLink({ href: address }).run()
  open.value = false
}

function remove() {
  props.editor.chain().focus().extendMarkRange('link').unsetLink().run()
  open.value = false
}

// The popover closes while the page goes away too; by then the editor is gone.
const refocus = () => { if (!props.editor.isDestroyed) props.editor.commands.focus() }
</script>

<template>
  <Popover v-model:open="open">
    <PopoverAnchor as-child><span class="inline-flex"><slot /></span></PopoverAnchor>
    <PopoverContent align="start" class="w-80" @close-auto-focus.prevent="refocus">
      <form class="grid gap-3" @submit.prevent="apply">
        <div class="grid gap-2">
          <Label :for="inputId">{{ t('editor.link.label') }}</Label>
          <!-- Enter on a highlighted page picks it (the list handles it); otherwise Enter submits the typed address. -->
          <Command class="gap-2 overflow-visible bg-transparent">
            <!-- Home and End move the caret in the typed address; the list would take them (and cancel them) even when none shows. -->
            <div class="contents" @keydown.home.capture.stop @keydown.end.capture.stop>
              <ListboxFilter
                :id="inputId" ref="input" :model-value="text" autocapitalize="off" autocomplete="off" spellcheck="false" :placeholder="t('editor.link.placeholder')"
                :aria-invalid="error !== ''" :aria-describedby="error ? errorId : undefined"
                class="h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/80 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 pointer-coarse:h-11"
                @update:model-value="onText"
              />
            </div>
            <LinkTargetList :query="query" :current="target?.href" @pick="pick" @found="found" />
          </Command>
          <p v-if="error" :id="errorId" role="alert" class="text-sm text-destructive">{{ error }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button type="submit" size="sm">{{ t('editor.link.apply') }}</Button>
          <Button v-if="hasLink" type="button" variant="ghost" size="sm" @click="remove">{{ t('editor.link.remove') }}</Button>
        </div>
      </form>
    </PopoverContent>
  </Popover>
</template>
