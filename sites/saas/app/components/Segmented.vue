<script setup lang="ts" generic="T extends string">
// A segmented control made of real radio inputs: arrow keys move the choice, a screen reader hears a radio group.
defineProps<{ legend: string; name: string; options: { value: T; label: string }[] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <fieldset class="segmented">
    <legend class="legend">{{ legend }}</legend>
    <label v-for="option in options" :key="option.value" class="option">
      <input v-model="model" class="input" type="radio" :name="name" :value="option.value">
      <span class="face">{{ option.label }}</span>
    </label>
  </fieldset>
</template>

<style scoped>
.segmented { display: inline-flex; margin: 0; padding: 0; min-width: 0; border: var(--line) solid var(--ink); border-radius: var(--radius); background: var(--surface); overflow: hidden; }
.legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.option { position: relative; display: block; }
.option + .option { border-left: var(--line) solid var(--ink); }
.input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.face { display: flex; align-items: center; min-height: 44px; padding: 0 18px; font-family: var(--head); font-weight: 700; font-size: 0.97rem; color: var(--ink); }
.input:checked + .face { background: var(--ink); color: var(--paper); }
/* The input is invisible, so the ring is drawn around the face. */
.input:focus-visible + .face { outline: 3px solid var(--yellow); outline-offset: -3px; box-shadow: inset 0 0 0 1px var(--ink); }
.input:focus-visible { outline: none; box-shadow: none; }
</style>
