<template>
  <span
    class="cursor-badge"
    :class="[sizeClass, variantClass]"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'default' | 'subtle' | 'primary' | 'success' | 'warning' | 'danger'
  size?: 'small' | 'medium' | 'large'
}>(), {
  variant: 'default',
  size: 'small'
})

const sizeClass = computed(() => `cursor-badge-${props.size}`)
const variantClass = computed(() => `cursor-badge-${props.variant}`)
</script>

<style>
/* Badge styles are intentionally NOT scoped — consumed via class in multiple components */

.cursor-badge {
  align-items: center;
  border-radius: 4px;
  display: inline-flex;
  font-weight: 500;
  height: fit-content;
  justify-content: center;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
}

.cursor-badge-small {
  font-size: 10px;
  letter-spacing: 0.12px;
  padding: 2px 3px;
}

.cursor-badge-medium {
  font-size: 12px;
  letter-spacing: 0.07px;
  padding: 3px 6px;
}

.cursor-badge-large {
  font-size: 13px;
  letter-spacing: -0.08px;
  padding: 4px 8px;
}

.cursor-badge-default {
  background-color: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
}

.cursor-badge-primary {
  background-color: var(--vscode-textLink-foreground);
}

.cursor-badge-primary,
.cursor-badge-success {
  color: var(--vscode-editor-background);
  opacity: 0.9;
}

.cursor-badge-success {
  background-color: var(--vscode-gitDecoration-addedResourceForeground);
}

.cursor-badge-warning {
  background-color: var(--vscode-gitDecoration-untrackedResourceForeground);
  color: var(--vscode-editor-background);
  opacity: 0.9;
}

.cursor-badge-danger {
  background-color: var(--vscode-errorForeground);
  color: var(--vscode-editor-foreground);
}

.cursor-badge-subtle {
  background-color: var(--cursor-bg-secondary);
  border: 1px solid var(--cursor-stroke-tertiary);
  color: var(--cursor-text-secondary);
}
</style>
