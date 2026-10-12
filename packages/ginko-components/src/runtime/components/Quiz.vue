<script setup lang="ts">
import { cloneVNode, nextTick, provide, reactive, ref, useId, useSlots, type VNode } from 'vue'
import { QUIZ_KEY } from './quiz.utils'
import { elements, Rendered } from './vnode-utils'
import { useText } from './text'

// ::quiz with ::quiz-question children: one question at a time, back/next, a result at the end. Everything runs in
// the browser; nothing is sent anywhere. The questions stay in the page (`hidden`) so their answers are kept.
defineProps<{ title?: string; description?: string }>()
const slots = useSlots()
const t = useText()
const id = useId()

const active = ref(0)
const showResults = ref(false)
const resetKey = ref(0)
const answers = reactive(new Map<number, boolean>())
const root = ref<HTMLElement | null>(null)
const retryButton = ref<HTMLButtonElement | null>(null)

provide(QUIZ_KEY, { report: (position: number, correct: boolean) => answers.set(position, correct), resetKey })

// Read in the template only: Vue warns when a slot is called in `setup`.
const questions = (): VNode[] => elements(slots.default?.())
const correctCount = () => [...answers.values()].filter(Boolean).length

function go(to: number) {
  active.value = to
}

async function showScore() {
  showResults.value = true
  await nextTick()
  retryButton.value?.focus()
}

async function retry() {
  answers.clear()
  active.value = 0
  showResults.value = false
  resetKey.value++
  await nextTick()
  root.value?.querySelector<HTMLElement>('fieldset')?.focus()
}
</script>

<template>
  <section ref="root" class="ginko-quiz" :aria-labelledby="title ? `${id}-title` : undefined">
    <div v-if="title || description" class="ginko-quiz-header">
      <p v-if="title" :id="`${id}-title`" class="ginko-quiz-title">{{ title }}</p>
      <p v-if="description" class="ginko-quiz-description">{{ description }}</p>
    </div>
    <template v-for="nodes in [questions()]" :key="0">
      <div class="ginko-quiz-body" :hidden="showResults">
        <div v-for="(node, i) in nodes" :key="i" class="ginko-quiz-step" :hidden="i !== active">
          <Rendered :node="cloneVNode(node, { position: i })" />
        </div>
      </div>
      <!-- Buttons use aria-disabled, not disabled, so the keyboard focus stays on them when they become inactive. -->
      <div v-if="nodes.length > 1 && !showResults" class="ginko-quiz-footer">
        <span class="ginko-quiz-progress">{{ t('quiz.progress', { current: active + 1, total: nodes.length }) }}</span>
        <div class="ginko-quiz-nav">
          <button type="button" class="ginko-quiz-button" :aria-disabled="active === 0 || undefined" @click="active > 0 && go(active - 1)">{{ t('quiz.back') }}</button>
          <button
            v-if="active < nodes.length - 1"
            type="button"
            class="ginko-quiz-button"
            :aria-disabled="!answers.has(active) || undefined"
            @click="answers.has(active) && go(active + 1)"
          >{{ t('quiz.next') }}</button>
          <button
            v-else
            type="button"
            class="ginko-quiz-button"
            :aria-disabled="answers.size < nodes.length || undefined"
            @click="answers.size >= nodes.length && showScore()"
          >{{ t('quiz.results') }}</button>
        </div>
      </div>
      <div class="ginko-quiz-results" aria-live="polite">
        <template v-if="showResults">
          <p class="ginko-quiz-score" :data-state="correctCount() === nodes.length ? 'perfect' : undefined">{{ t('quiz.score', { correct: correctCount(), total: nodes.length }) }}</p>
          <p class="ginko-quiz-note">{{ correctCount() === nodes.length ? t('quiz.perfect') : t('quiz.retryPrompt') }}</p>
          <button ref="retryButton" type="button" class="ginko-quiz-button" @click="retry">{{ t('quiz.retry') }}</button>
        </template>
      </div>
    </template>
  </section>
</template>
