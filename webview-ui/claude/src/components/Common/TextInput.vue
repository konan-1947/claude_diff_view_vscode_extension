<template>
  <input
    ref="inputRef"
    :type="type"
    :value="modelValue"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    @change="$emit('change', ($event.target as HTMLInputElement).value)"
    @keydown="$emit('keydown', $event)"
    class="common-text-input"
    :class="{
      'common-text-input-small': size === 'small',
      'common-text-input-mono': monospace,
      'opacity-50 cursor-not-allowed': disabled
    }"
    :placeholder="placeholder"
    :disabled="disabled"
    :spellcheck="spellcheck"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{
  modelValue: string
  type?: 'text' | 'password' | 'email' | 'url'
  placeholder?: string
  disabled?: boolean
  spellcheck?: boolean
  monospace?: boolean
  size?: 'small' | 'medium'
}>(), {
  type: 'text',
  spellcheck: false,
  monospace: false,
  size: 'medium'
})

defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const inputRef = ref<HTMLInputElement>()

defineExpose({ inputRef })
</script>

<style scoped>
.common-text-input {
  padding: 4px 8px;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--vscode-input-foreground);
  outline: none;
  box-sizing: border-box;
  line-height: 1.4;
}

.common-text-input-small {
  padding: 3px 6px;
  border-radius: 4px;
}

.common-text-input-mono {
  font-family: var(--vscode-editor-font-family), monospace;
}

.common-text-input:focus {
  border-color: var(--vscode-focusBorder);
}

.common-text-input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}

.common-text-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
