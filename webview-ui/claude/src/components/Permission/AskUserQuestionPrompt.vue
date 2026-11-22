<template>
  <!-- AskUserQuestion, as the CLI asks it: one question at a time (tabs when
       there are several, ←/→ to switch), numbered options, a free-text
       "Other" row, checkboxes for multi-select, and a review step before
       submitting several answers. Answers go back through canUseTool's
       `updatedInput.answers`, keyed by question text. -->
  <PromptFrame :hint="hint">
    <template #title>
      <div v-if="questions.length > 1" class="aq-tabs">
        <button
          v-for="(q, i) in questions"
          :key="i"
          type="button"
          tabindex="-1"
          :class="['aq-tab', { active: i === step, done: isAnswered(i) }]"
          @mousedown.prevent
          @click="step = i"
        >
          <span :class="['codicon', isAnswered(i) ? 'codicon-pass-filled' : 'codicon-circle-large']" />
          {{ q.header || `Question ${i + 1}` }}
        </button>
        <button
          type="button"
          tabindex="-1"
          :class="['aq-tab', { active: step === questions.length }]"
          @mousedown.prevent
          @click="step = questions.length"
        >
          <span class="codicon codicon-check" />
          Submit
        </button>
      </div>
      <!-- One question: chip and question share the title row -->
      <span v-else-if="current" class="aq-title">
        <span v-if="current.header" class="aq-chip">{{ current.header }}</span>
        <span class="aq-question">{{ current.question }}</span>
      </span>
    </template>

    <template v-if="current">
      <div v-if="questions.length > 1" class="aq-question">{{ current.question }}</div>
      <PromptOptions
        :key="step"
        ref="optionsRef"
        layout="grid"
        :options="questionOptions"
        @pick="onPick"
        @move="focused = $event"
        @side="moveStep"
        @cancel="decline"
      />
      <pre v-if="previewText" class="aq-preview">{{ previewText }}</pre>
    </template>

    <template v-else>
      <div class="aq-question">Review your answers</div>
      <div class="aq-review">
        <div v-for="(q, i) in questions" :key="i" class="aq-review-row">
          <span class="aq-review-q">{{ q.question }}</span>
          <span :class="['aq-review-a', { missing: !isAnswered(i) }]">
            {{ isAnswered(i) ? answerText(i) : 'Not answered' }}
          </span>
        </div>
      </div>
      <PromptOptions
        :key="'review'"
        layout="grid"
        :options="reviewOptions"
        @pick="onReviewPick"
        @side="moveStep"
        @cancel="decline"
      />
    </template>
  </PromptFrame>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PermissionRequest } from '../../core/PermissionRequest'
import PromptFrame from './PromptFrame.vue'
import PromptOptions, { type PromptOption } from './PromptOptions.vue'

interface QuestionOption {
  label: string
  description?: string
  preview?: string
}

interface Question {
  question: string
  header?: string
  options: QuestionOption[]
  multiSelect?: boolean
}

const props = defineProps<{ request: PermissionRequest }>()

const questions = computed<Question[]>(() => {
  const raw = (props.request.inputs as any)?.questions
  return Array.isArray(raw)
    ? raw.filter((q: any) => q && typeof q.question === 'string' && Array.isArray(q.options))
    : []
})

/** Question shown; `questions.length` is the review step */
const step = ref(0)
/** Option under the cursor (its preview is shown) */
const focused = ref(0)
/** Picked option labels per question */
const picked = ref<Record<number, string[]>>({})
/** Text typed in a question's "Other" row (counts as an answer when set) */
const custom = ref<Record<number, string>>({})

const current = computed<Question | undefined>(() => questions.value[step.value])

const questionOptions = computed<PromptOption[]>(() => {
  const q = current.value
  if (!q) return []
  const chosen = picked.value[step.value] ?? []
  const list: PromptOption[] = q.options.map((o) => ({
    label: o.label,
    detail: o.description && o.description !== o.label ? o.description : undefined,
    checkbox: q.multiSelect,
    checked: q.multiSelect && chosen.includes(o.label),
  }))
  const other = custom.value[step.value]
  list.push({
    label: other ? `Other: ${other}` : q.multiSelect ? 'Other (type, Enter to add)' : 'Type something else',
    input: true,
    // Multi-select: ticked once Enter added the typed text to the answers
    checkbox: q.multiSelect,
    checked: q.multiSelect && !!other,
  })
  if (q.multiSelect) {
    const last = step.value === questions.value.length - 1
    list.push({
      label: questions.value.length > 1 && last ? 'Review answers' : last ? 'Submit' : 'Next',
      muted: !isAnswered(step.value),
    })
  }
  return list
})

const reviewOptions: PromptOption[] = [{ label: 'Submit answers' }, { label: 'Cancel' }]

const previewText = computed(() => {
  const option = current.value?.options[focused.value]
  return option?.preview ?? ''
})

const hint = computed(() => {
  const keys = ['←/→ to select', current.value?.multiSelect ? 'Enter to toggle' : 'Enter to confirm']
  if (questions.value.length > 1) keys.push('Tab to switch question')
  keys.push('Esc to decline')
  return keys
})

function isAnswered(i: number) {
  return (picked.value[i]?.length ?? 0) > 0 || !!custom.value[i]
}

function answers(i: number): string[] {
  const list = [...(picked.value[i] ?? [])]
  if (custom.value[i]) list.push(custom.value[i])
  return list
}

function answerText(i: number) {
  return answers(i).join(', ')
}

function moveStep(delta: 1 | -1) {
  const last = questions.value.length > 1 ? questions.value.length : 0
  step.value = Math.min(Math.max(0, step.value + delta), last)
  focused.value = 0
}

function advance() {
  if (step.value < questions.value.length - 1) {
    step.value++
    focused.value = 0
  } else if (questions.value.length > 1) {
    step.value = questions.value.length
  } else {
    submit()
  }
}

function onPick(index: number, text: string) {
  const q = current.value
  if (!q) return
  const i = step.value
  const option = questionOptions.value[index]
  if (!option) return

  if (option.input) {
    if (q.multiSelect) {
      // Enter on the text row adds (or, emptied, removes) the custom answer
      custom.value = { ...custom.value, [i]: text }
      return
    }
    if (!text) return
    custom.value = { ...custom.value, [i]: text }
    picked.value = { ...picked.value, [i]: [] }
    advance()
    return
  }

  if (index < q.options.length) {
    const label = q.options[index].label
    if (q.multiSelect) {
      const chosen = picked.value[i] ?? []
      picked.value = {
        ...picked.value,
        [i]: chosen.includes(label) ? chosen.filter((l) => l !== label) : [...chosen, label],
      }
      return
    }
    picked.value = { ...picked.value, [i]: [label] }
    custom.value = { ...custom.value, [i]: '' }
    advance()
    return
  }

  // Multi-select "Next" / "Submit" row
  if (isAnswered(i)) advance()
}

function onReviewPick(index: number) {
  if (index === 0) submit()
  else decline()
}

function submit() {
  const answerMap: Record<string, string> = {}
  const annotations: Record<string, { preview?: string }> = {}
  questions.value.forEach((q, i) => {
    if (!isAnswered(i)) return
    answerMap[q.question] = answerText(i)
    // The preview of the picked option, as the CLI records it
    const option = q.options.find((o) => (picked.value[i] ?? []).includes(o.label))
    if (!q.multiSelect && option?.preview) annotations[q.question] = { preview: option.preview }
  })
  const updated: Record<string, unknown> = { ...props.request.inputs, answers: answerMap }
  if (Object.keys(annotations).length) updated.annotations = annotations
  props.request.accept(updated)
}

function decline() {
  props.request.reject(
    "The user declined to answer the questions. STOP what you are doing and wait for the user to tell you how to proceed.",
    true
  )
}
</script>

<style scoped>
.aq-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-weight: normal;
}

.aq-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--cs-fg-52);
  font: inherit;
  cursor: pointer;
}

.aq-tab .codicon {
  font-size: 12px;
}

.aq-tab.done {
  color: var(--cs-fg-74);
}

.aq-tab.done .codicon {
  color: var(--vscode-charts-green, var(--cs-fg));
}

.aq-tab.active {
  background: var(--cs-fg-14);
  color: var(--cs-fg);
}

.aq-title {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.aq-chip {
  flex-shrink: 0;
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--cs-fg-14);
  font-weight: normal;
  font-size: 11px;
}

.aq-question {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.aq-preview {
  margin: 0;
  padding: 6px 8px;
  max-height: 200px;
  overflow: auto;
  border-radius: 4px;
  background: var(--cs-fg-8);
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
  white-space: pre;
}

.aq-review {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aq-review-row {
  display: flex;
  flex-direction: column;
}

.aq-review-q {
  color: var(--cs-fg-66);
}

.aq-review-a {
  padding-left: 12px;
}

.aq-review-a.missing {
  color: var(--cs-fg-36);
}
</style>
