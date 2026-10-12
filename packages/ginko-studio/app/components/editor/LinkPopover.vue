<!-- The address of a link: opened from the toolbar button, Mod+K or the bubble menu. The slot is the anchor
     (the toolbar's link button). The address goes through the core's rule (`isSafeHref`) before it is set. -->
<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'
import { useI18n } from '#imports'
import { isSafeHref } from '@lupinum/ginko/internal'
import { normalizeHref } from '@lupinum/ginko-editor'
import type { Editor } from '@tiptap/core'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'
import { Popover, PopoverAnchor, PopoverContent } from '@studio/components/ui/popover'

const props = defineProps<{ editor: Editor }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()

const inputId = useId()
const errorId = useId()
const href = ref('')
const error = ref('')
const hasLink = ref(false)
const input = ref<{ $el?: Element } | null>()

watch(open, (isOpen) => {
  if (!isOpen) return
  hasLink.value = props.editor.isActive('link')
  href.value = hasLink.value ? String(props.editor.getAttributes('link').href ?? '') : ''
  error.value = ''
  nextTick(() => {
    const el = input.value?.$el
    if (el instanceof HTMLInputElement) el.select()
  })
})

function apply() {
  const typed = href.value.trim()
  if (!typed && hasLink.value) return remove()
  const address = normalizeHref(typed)
  if (!typed || !isSafeHref(address)) { error.value = t('editor.link.refused'); return }
  const chain = props.editor.chain().focus()
  if (hasLink.value) chain.extendMarkRange('link').setLink({ href: address }).run()
  else if (props.editor.state.selection.empty) chain.insertContent({ type: 'text', text: address, marks: [{ type: 'link', attrs: { href: address } }] }).run()
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
          <Input
            :id="inputId" ref="input" v-model="href" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="https://…"
            :aria-invalid="error !== ''" :aria-describedby="error ? errorId : undefined" @input="error = ''"
          />
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
