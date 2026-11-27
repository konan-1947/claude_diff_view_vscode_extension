<template>
  <!-- /btw: a side question and its answer, in place of the input. The CLI
       answers from the live context (also mid-turn) and keeps both out of the
       transcript, so closing the panel drops them. -->
  <CommandPanel
    title="Side question"
    :subtitle="oneLine(question)"
    :hint="hint"
    persistent
    top
    @cancel="emit('close')"
    @key="onKey"
  >
    <div class="btw-body">
      <div v-if="state === 'asking'" class="btw-muted">Answering…</div>
      <div v-else-if="state === 'error'" class="btw-error">{{ error }}</div>
      <TextBlock v-else :block="answerBlock" />
    </div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import CommandPanel from './CommandPanel.vue'
import TextBlock from '../Messages/blocks/TextBlock.vue'
import { RuntimeKey } from '../../composables/runtimeContext'
import type { TextBlock as TextBlockType } from '../../models/ContentBlock'

const props = defineProps<{ question: string }>()

const emit = defineEmits<{ (e: 'close'): void }>()

const runtime = inject(RuntimeKey)

const state = ref<'asking' | 'answered' | 'error'>('asking')
const answer = ref('')
const error = ref('')
let closed = false

const answerBlock = computed(() => ({ type: 'text', text: answer.value }) as TextBlockType)

const hint = computed(() =>
  state.value === 'asking' ? ['Esc to cancel'] : ['Enter, Space or Esc to dismiss']
)

function oneLine(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function onKey(event: KeyboardEvent) {
  if (state.value !== 'asking' && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
  }
}

onMounted(async () => {
  const session = runtime?.sessionStore.activeSession()
  if (!session) {
    state.value = 'error'
    error.value = 'No conversation in this tab'
    return
  }
  try {
    const text = await session.askSideQuestion(props.question)
    if (closed) return
    answer.value = text
    state.value = 'answered'
  } catch (e) {
    if (closed) return
    error.value = e instanceof Error ? e.message : String(e)
    state.value = 'error'
  }
})

// A question still being answered when the panel closes is dropped (the CLI
// finishes it, but nobody is shown the answer)
onUnmounted(() => {
  closed = true
})
</script>

<style scoped>
.btw-body {
  max-height: 260px;
  overflow-y: auto;
  user-select: text;
  cursor: auto;
  font-size: 13px;
  line-height: 1.5;
}

.btw-muted {
  color: var(--cs-fg-52);
}

.btw-error {
  color: var(--vscode-errorForeground);
  overflow-wrap: anywhere;
}
</style>
