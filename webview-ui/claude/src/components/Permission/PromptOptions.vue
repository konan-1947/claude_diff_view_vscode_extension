<template>
  <!-- The CLI's numbered choice list: ↑/↓ move (wrapping), a digit or Enter
       picks. An option with `input` is a text row ("No, and tell Claude what
       to do differently"): moving onto it focuses the field, Enter there
       picks it with the typed text, ↑/↓ leave it. -->
  <div
    ref="rootRef"
    class="prompt-options"
    role="listbox"
    tabindex="0"
    @keydown="onKeydown"
  >
    <div
      v-for="(option, i) in options"
      :key="i"
      role="option"
      :aria-selected="i === index"
      :class="['po-row', { active: i === index, checked: option.checked, muted: option.muted }]"
      @mouseenter="hover(i)"
      @mousedown="onRowMouseDown($event, option)"
      @click="clickRow(i)"
    >
      <span class="po-pointer">{{ i === index ? '›' : '' }}</span>
      <span class="po-num">{{ digitsEnabled && i < 9 ? `${i + 1}.` : '' }}</span>
      <span
        v-if="option.checkbox"
        :class="['codicon', option.checked ? 'codicon-pass-filled' : 'codicon-circle-large', 'po-box']"
      />
      <span class="po-main">
        <template v-if="option.input">
          <input
            :ref="(el) => setInputRef(i, el)"
            v-model="texts[i]"
            class="po-input"
            :placeholder="option.label"
            @focus="index = i"
            @keydown="onInputKeydown($event, i)"
          />
        </template>
        <template v-else>
          <span class="po-label">{{ option.label }}</span>
          <span v-if="option.detail" class="po-detail">{{ option.detail }}</span>
        </template>
      </span>
      <span v-if="option.hint" class="po-hint">{{ option.hint }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'

export interface PromptOption {
  label: string
  /** Muted text under the label (an option's description) */
  detail?: string
  /** Muted key or note on the right ("shift+tab", "esc") */
  hint?: string
  /** Text row: `label` is its placeholder, the pick carries the text */
  input?: boolean
  /** Checkbox row (multi-select) */
  checkbox?: boolean
  checked?: boolean
  /** Shown dimmer (the "Submit" row while nothing is chosen) */
  muted?: boolean
}

interface Props {
  options: PromptOption[]
  /** Row the cursor starts on */
  initialIndex?: number
  /** 1-9 pick directly; off for asks that must not be approved by a stray key */
  digits?: boolean
  /** Take the keyboard focus when shown (the CLI's dialog replaces the prompt) */
  autofocus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  initialIndex: 0,
  digits: true,
  autofocus: true,
})

const emit = defineEmits<{
  /** `text`: what was typed in an `input` row (trimmed) */
  (e: 'pick', index: number, text: string): void
  (e: 'cancel'): void
  /** ←/→ (question tabs) */
  (e: 'side', step: 1 | -1): void
  /** Cursor moved (a preview follows the focused option) */
  (e: 'move', index: number): void
}>()

const rootRef = ref<HTMLDivElement>()
const index = ref(clampIndex(props.initialIndex))
const texts = ref<Record<number, string>>({})
const inputs = new Map<number, HTMLInputElement>()
const digitsEnabled = ref(props.digits)

watch(() => props.digits, (d) => (digitsEnabled.value = d))

function clampIndex(i: number) {
  return Math.min(Math.max(0, i), Math.max(0, props.options.length - 1))
}

function setInputRef(i: number, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLInputElement) inputs.set(i, el)
  else inputs.delete(i)
}

// The cursor on a text row means typing goes there; off it, back to the list
watch(index, async (i) => {
  emit('move', i)
  await nextTick()
  if (props.options[i]?.input) inputs.get(i)?.focus()
  else if (document.activeElement instanceof HTMLInputElement && rootRef.value?.contains(document.activeElement)) {
    rootRef.value?.focus()
  }
})

// A new question (other options) starts over at its own initial row
watch(
  () => props.options,
  (next, prev) => {
    if (next.length !== prev?.length) index.value = clampIndex(props.initialIndex)
  }
)

watch(() => props.initialIndex, (i) => (index.value = clampIndex(i)))

function move(step: number) {
  const n = props.options.length
  if (n === 0) return
  index.value = (index.value + step + n) % n
}

function pick(i: number) {
  if (i < 0 || i >= props.options.length) return
  index.value = i
  emit('pick', i, (texts.value[i] ?? '').trim())
}

function hover(i: number) {
  // Hovering must not steal the caret from a text row being typed in
  const active = document.activeElement
  if (active instanceof HTMLInputElement && inputs.get(index.value) === active) return
  if (!props.options[i]?.input) index.value = i
}

function onRowMouseDown(event: MouseEvent, option: PromptOption) {
  // Keep the focus inside the list (a click must not blur it to the page)
  if (!option.input) event.preventDefault()
}

function clickRow(i: number) {
  if (props.options[i]?.input) {
    index.value = i
    inputs.get(i)?.focus()
    return
  }
  pick(i)
}

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.target instanceof HTMLInputElement) return
  const key = event.key
  let handled = true
  if (key === 'ArrowDown' || (key === 'Tab' && !event.shiftKey)) move(1)
  else if (key === 'ArrowUp') move(-1)
  else if (key === 'ArrowRight') emit('side', 1)
  else if (key === 'ArrowLeft') emit('side', -1)
  else if (key === 'Enter' || key === ' ') pick(index.value)
  else if (key === 'Escape') emit('cancel')
  else if (digitsEnabled.value && /^[1-9]$/.test(key) && Number(key) <= props.options.length) {
    const i = Number(key) - 1
    if (props.options[i]?.input) index.value = i
    else pick(i)
  } else handled = false
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function onInputKeydown(event: KeyboardEvent, i: number) {
  if (event.isComposing) return
  const key = event.key
  let handled = true
  if (key === 'Enter' && !event.shiftKey) pick(i)
  else if (key === 'Escape') emit('cancel')
  else if (key === 'ArrowUp') move(-1)
  else if (key === 'ArrowDown') move(1)
  else handled = false
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function focus() {
  if (props.options[index.value]?.input) inputs.get(index.value)?.focus()
  else rootRef.value?.focus()
}

onMounted(() => {
  if (props.autofocus) focus()
  emit('move', index.value)
})

defineExpose({ focus, setIndex: (i: number) => (index.value = clampIndex(i)) })
</script>

<style scoped>
.prompt-options {
  display: flex;
  flex-direction: column;
  outline: none;
  user-select: none;
}

.po-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cs-fg-74);
}

.po-row.active {
  background: var(--cs-fg-8);
  color: var(--cs-fg);
}

.po-row.muted {
  color: var(--cs-fg-36);
}

.po-pointer {
  width: 8px;
  flex-shrink: 0;
  color: var(--cs-fg);
}

.po-num {
  width: 16px;
  flex-shrink: 0;
  text-align: right;
  color: var(--cs-fg-36);
  font-size: 11px;
  line-height: 16px;
}

.po-box {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 16px;
}

.po-row.checked .po-box {
  color: var(--vscode-charts-green, var(--cs-fg));
}

.po-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.po-label {
  overflow-wrap: anywhere;
}

.po-detail {
  color: var(--cs-fg-52);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.po-hint {
  flex-shrink: 0;
  margin-left: 8px;
  font-size: 11px;
  color: var(--cs-fg-36);
}

.po-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
}

.po-input::placeholder {
  color: var(--cs-fg-52);
}

.po-row.active .po-input::placeholder {
  color: var(--cs-fg-66);
}
</style>
