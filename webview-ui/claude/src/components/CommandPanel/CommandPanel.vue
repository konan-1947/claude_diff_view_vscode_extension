<template>
  <!-- Command panel shown in place of the chat input, inside the input's own
       frame (as the CLI swaps its prompt for a menu). Cursor styling: header row
       with the title on the left and Undo/Keep-style actions on the right.
       Keys go to the content (`key`); Esc and focus leaving the panel cancel. -->
  <div
    ref="rootRef"
    class="command-panel"
    tabindex="0"
    @keydown="onKeydown"
    @focusout="onFocusOut"
  >
    <div class="cp-header">
      <span class="cp-title">{{ title }}</span>
      <div class="cp-actions">
        <button
          v-for="action in actions"
          :key="action.label"
          type="button"
          tabindex="-1"
          :class="['cp-action', { primary: action.primary, active: action.active }]"
          :title="action.key ? `${action.label} (${action.key})` : action.label"
          @mousedown.prevent
          @click="action.run()"
        >
          {{ action.label }}<span v-if="action.key" class="cp-kbd">{{ action.key }}</span>
        </button>
      </div>
    </div>

    <div class="cp-body">
      <slot />
    </div>

    <div v-if="hint" class="cp-hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

export interface CommandPanelAction {
  label: string
  /** Key shown next to the label (the content handles the key itself) */
  key?: string
  primary?: boolean
  active?: boolean
  run: () => void
}

interface Props {
  title: string
  actions?: CommandPanelAction[]
  /** Muted key help under the content, e.g. "←/→ to adjust · Esc to cancel" */
  hint?: string
}

withDefaults(defineProps<Props>(), { actions: () => [], hint: '' })

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'key', event: KeyboardEvent): void
}>()

const rootRef = ref<HTMLDivElement>()

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('cancel')
    return
  }
  emit('key', event)
}

// Clicking elsewhere (the input, the transcript) dismisses it, like a menu
function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (!next || !rootRef.value?.contains(next)) {
    emit('cancel')
  }
}

onMounted(() => rootRef.value?.focus())

defineExpose({ focus: () => rootRef.value?.focus() })
</script>

<style scoped>
.command-panel {
  /* Same height as the input it replaces (110px editor + 6px gap + 28px button
     row), so the frame does not jump when the panel opens or closes. */
  min-height: 144px;
  display: flex;
  flex-direction: column;
  outline: none;
  user-select: none;
  cursor: default;
  font-size: 12px;
  line-height: 16px;
  color: var(--cs-fg);
}

.cp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 26px;
}

.cp-title {
  color: var(--cs-fg-66);
}

.cp-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.cp-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--cs-fg-74);
  font: inherit;
  cursor: pointer;
  transition: background-color var(--cs-duration) ease;
}

.cp-action:hover {
  background: var(--cs-fg-8);
}

.cp-action.active {
  background: var(--cs-fg-8);
  color: var(--cs-fg);
}

.cp-action.primary {
  background: var(--cs-fg-14);
  color: var(--cs-fg);
}

.cp-action.primary:hover {
  background: var(--cs-fg-20);
}

.cp-kbd {
  color: var(--cs-fg-36);
  font-size: 11px;
}

.cp-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 6px 2px;
}

/* Bottom row, where the input's button row sits */
.cp-hint {
  height: 28px;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--cs-fg-36);
}
</style>
