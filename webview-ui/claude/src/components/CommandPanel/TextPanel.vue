<template>
  <!-- One-line argument for a command the CLI only answers with usage text
       when typed bare (`/goal`, `/rename`, `/config`). Enter sends it. -->
  <CommandPanel
    :title="title"
    :actions="allActions"
    :hint="hint.length ? hint : ['Enter to confirm', 'Esc to cancel']"
    @cancel="emit('close')"
    @key="onKey"
  >
    <input
      ref="inputRef"
      v-model="text"
      class="tp-input"
      type="text"
      spellcheck="false"
      :placeholder="placeholder"
    />
    <div v-if="note" class="tp-note">{{ note }}</div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import CommandPanel, { type CommandPanelAction } from './CommandPanel.vue'

interface Props {
  title: string
  placeholder?: string
  initial?: string
  hint?: string[]
  /** Muted line under the input (example, what happens on Enter) */
  note?: string
  submitLabel?: string
  /** Extra header actions, left of the submit button */
  actions?: CommandPanelAction[]
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  initial: '',
  hint: () => [],
  note: '',
  submitLabel: 'Set',
  actions: () => [],
})

const emit = defineEmits<{
  (e: 'submit', text: string): void
  (e: 'close'): void
}>()

const text = ref(props.initial)
const inputRef = ref<HTMLInputElement>()

const canSubmit = computed(() => text.value.trim().length > 0)

function submit() {
  if (!canSubmit.value) return
  emit('submit', text.value.trim())
  emit('close')
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    submit()
  }
}

const allActions = computed<CommandPanelAction[]>(() => [
  ...props.actions,
  { label: props.submitLabel, key: '↵', primary: true, run: submit },
])

// CommandPanel focuses its own frame once mounted (after this child): take
// the focus back on the next tick so typing goes to the input.
onMounted(() => {
  setTimeout(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  }, 0)
})
</script>

<style scoped>
.tp-input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  border: 1px solid var(--cs-fg-12);
  border-radius: 4px;
  background: transparent;
  color: var(--cs-fg);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  outline: none;
  user-select: text;
}

.tp-input:focus {
  border-color: var(--cs-fg-36);
}

.tp-input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}

.tp-note {
  margin-top: 6px;
  color: var(--cs-fg-36);
}
</style>
