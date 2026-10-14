<script setup lang="ts">
import { computed, inject, nextTick, ref, useId, useSlots, watch, type VNode } from 'vue'
import { isOn } from './interactive-utils'
import { isCorrectAnswer, parseQuizOptions, QUIZ_KEY, type QuizOption } from './quiz.utils'
import { elements, isVNode, kids, textOf } from './vnode-utils'
import { useText } from './text'

// One question of ::quiz. The answers are a Markdown task list in the content (`- [x]` right, `- [ ]` wrong); they
// render as real radio buttons or checkboxes in a <fieldset> with a <legend>. Nothing says which answer is right
// until "check" is pressed; the result and the optional `#explanation` slot then appear in an aria-live region.
const props = defineProps<{ question: string; mode?: string; position?: number }>()
const slots = useSlots()
const t = useText()
const id = useId()

const quiz = inject(QUIZ_KEY, null)

const multiple = computed(() => props.mode === 'multiple')

/** The task-list items of the content: their text for the checks, their nodes for display. */
function readItems() {
  const list = elements(slots.default?.()).find((n) => n.type === 'ul')
  if (!list) return []
  return kids(list).filter(isVNode).map((li) => {
    const parts = kids(li)
    const input = parts.find((p): p is VNode => isVNode(p) && p.type === 'input')
    const raw = input?.props ?? {}
    const correct = isOn(raw.checked)
    const nodes = parts.filter((p) => p !== input)
    if (typeof nodes[0] === 'string') nodes[0] = nodes[0].replace(/^\s+/, '')
    return { text: nodes.map(textOf).join(''), correct, nodes }
  })
}

// Read from the slot on every call, never in `setup` (Vue warns about that, and the content may change under us).
function read() {
  const items = readItems()
  const parsed = parseQuizOptions(items.map(({ text, correct }): QuizOption => ({ text, correct })), multiple.value ? 'multiple' : 'single')
  return { problem: parsed.problem, options: parsed.options, nodes: items.map((i) => i.nodes) }
}

const selected = ref(new Set<number>())
const submitted = ref(false)
const right = () => isCorrectAnswer(read().options, selected.value)
const root = ref<HTMLElement | null>(null)

function pick(index: number, checked: boolean) {
  if (submitted.value) return
  if (!multiple.value) selected.value = new Set([index])
  else {
    const next = new Set(selected.value)
    if (checked) next.add(index)
    else next.delete(index)
    selected.value = next
  }
}

function check() {
  if (submitted.value || selected.value.size === 0) return
  submitted.value = true
  quiz?.report(props.position ?? 0, right())
}

if (quiz) {
  watch(quiz.resetKey, () => {
    submitted.value = false
    selected.value = new Set()
  })
}

const state = (option: QuizOption, i: number) => (submitted.value ? (option.correct ? 'correct' : selected.value.has(i) ? 'incorrect' : 'idle') : selected.value.has(i) ? 'selected' : 'idle')

/** Moves focus to this question (used by the quiz after "try again"). */
defineExpose({ focus: async () => { await nextTick(); root.value?.focus() } })

// Renders the nodes of an answer (they may hold bold text or code).
const Nodes = (p: { nodes: unknown[] }) => p.nodes as VNode[]
</script>

<template>
  <fieldset ref="root" class="ginko-quiz-question" tabindex="-1">
    <legend class="ginko-quiz-legend">
      {{ question }}
      <span v-if="multiple" class="ginko-quiz-hint">{{ t('quiz.multiple') }}</span>
    </legend>
    <template v-for="view in [read()]" :key="0">
      <p v-if="view.problem" class="ginko-quiz-problem" role="alert">{{ t(`quiz.problem.${view.problem}`) }}</p>
      <template v-else>
        <div class="ginko-quiz-options">
          <label v-for="(option, i) in view.options" :key="i" class="ginko-quiz-option" :data-state="state(option, i)">
            <input
              class="ginko-quiz-input"
              :type="multiple ? 'checkbox' : 'radio'"
              :name="id"
              :checked="selected.has(i)"
              :disabled="submitted"
              @change="pick(i, ($event.target as HTMLInputElement).checked)"
            >
            <span class="ginko-quiz-key" aria-hidden="true">{{ String.fromCharCode(65 + i) }}</span>
            <span class="ginko-quiz-option-label"><Nodes :nodes="view.nodes[i]!" /></span>
            <span v-if="submitted && (option.correct || selected.has(i))" class="ginko-quiz-mark">
              <span aria-hidden="true">{{ option.correct ? '✓' : '✗' }}</span>
              <span class="ginko-quiz-sr">({{ option.correct ? t('quiz.optionRight') : t('quiz.optionWrong') }})</span>
            </span>
          </label>
        </div>
        <!-- Not `disabled`: a disabled button would drop the keyboard focus after the click. -->
        <button type="button" class="ginko-quiz-button" :aria-disabled="submitted || selected.size === 0 || undefined" @click="check">{{ t('quiz.check') }}</button>
        <div class="ginko-quiz-feedback" aria-live="polite" aria-atomic="true">
          <template v-if="submitted">
            <p class="ginko-quiz-result" :data-state="right() ? 'correct' : 'incorrect'">{{ right() ? t('quiz.correct') : t('quiz.incorrect') }}</p>
            <div v-if="$slots.explanation" class="ginko-quiz-explanation"><slot name="explanation" /></div>
          </template>
        </div>
      </template>
    </template>
  </fieldset>
</template>
