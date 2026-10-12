<!-- Rights of a staff member as a checklist (UI.md 7): every task of every live brick, grouped under
     its brick label. The caller sets the start value; nothing is checked here by default. -->
<script setup lang="ts">
import type { Brick } from '@lupinum/ginko'
import { taskRef } from '../utils/content'
import { useStudioSite } from '../utils/labels'

const props = defineProps<{ bricks: [string, Brick][]; modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [grants: string[]] }>()

const { shown } = useStudioSite()
const groups = computed(() => props.bricks
  .map(([key, brick]) => ({ key, label: shown(brick.label), tasks: brick.tasks ?? [] }))
  .filter((group) => group.tasks.length))

function toggle(grant: string, on: boolean) {
  const rest = props.modelValue.filter((g) => g !== grant)
  emit('update:modelValue', on ? [...rest, grant] : rest)
}
</script>

<template>
  <div class="grid gap-3">
    <fieldset v-for="group in groups" :key="group.key" class="m-0 grid gap-1 rounded-xl border bg-card px-4 py-2.5">
      <legend class="px-1 text-sm font-semibold">{{ group.label }}</legend>
      <label v-for="task in group.tasks" :key="task.id" class="flex min-h-11 cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          class="m-0 size-5 flex-none accent-primary"
          :checked="modelValue.includes(taskRef(group.key, task))"
          @change="toggle(taskRef(group.key, task), ($event.target as HTMLInputElement).checked)"
        >
        <span>{{ shown(task.label) }}</span>
      </label>
    </fieldset>
  </div>
</template>
