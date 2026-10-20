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
  <!-- Bricks side by side where the container has room (2-3 columns on a desktop), one column on a phone. -->
  <div class="@container">
    <div class="grid items-start gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
      <fieldset v-for="group in groups" :key="group.key" class="m-0 grid min-w-0 gap-0.5 rounded-lg bg-muted/50 px-3 pt-2 pb-1.5">
        <legend class="float-left mb-1 w-full text-sm font-semibold">{{ group.label }}</legend>
        <label v-for="task in group.tasks" :key="task.id" class="flex min-h-11 cursor-pointer items-center gap-2.5 text-base min-[900px]:min-h-9 min-[900px]:text-sm pointer-coarse:min-h-11">
          <input
            type="checkbox"
            class="m-0 size-5 flex-none accent-primary min-[900px]:size-4"
            :checked="modelValue.includes(taskRef(group.key, task))"
            @change="toggle(taskRef(group.key, task), ($event.target as HTMLInputElement).checked)"
          >
          <span class="min-w-0">{{ shown(task.label) }}</span>
        </label>
      </fieldset>
    </div>
  </div>
</template>
