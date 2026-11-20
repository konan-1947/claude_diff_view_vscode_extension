<template>
  <SelectRoot v-model="model" :disabled="disabled">
    <SelectTrigger class="scope-select-trigger" :class="badgeClass">
      <SelectValue aria-label="Target Scope">
        {{ currentLabel }}
      </SelectValue>
      <!-- Hidden icon to indicate interactability on hover? Or just reliance on badge style -->
    </SelectTrigger>

    <SelectPortal>
      <SelectContent class="scope-select-content" :side-offset="5" position="popper" align="start">
        <SelectViewport class="scope-select-viewport">
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="scope-select-item"
          >
            <SelectItemText>
              {{ option.label }}
            </SelectItemText>
            <SelectItemIndicator class="scope-select-item-indicator">
              <span class="codicon codicon-check"></span>
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator
} from 'reka-ui';

type ScopeValue = 'global' | 'shared' | 'local';

const props = defineProps<{
  modelValue: ScopeValue;
  disabled?: boolean;
  // Optional override for display logic if needed, but defaults are good
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: ScopeValue): void;
}>();

const model = computed({
  get: () => props.modelValue,
  set: (val: ScopeValue) => emit('update:modelValue', val)
});

const options = [
  { value: 'global', label: 'User' },
  { value: 'shared', label: 'Workspace' },
  { value: 'local', label: 'Local' }
] as const;

const currentLabel = computed(() => {
  const opt = options.find((o) => o.value === props.modelValue);
  return opt ? opt.label : 'Unknown';
});

const badgeClass = computed(() => {
  if (props.disabled) return 'scope-badge-disabled';

  switch (props.modelValue) {
    case 'global':
      return 'scope-badge-user';
    case 'shared':
      return 'scope-badge-workspace';
    case 'local':
      return 'scope-badge-local';
    default:
      return 'scope-badge-default';
  }
});
</script>

<style scoped>
/* Trigger / Badge Styles */
.scope-select-trigger {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px; /* Slightly rounded, like the screenshot */
  padding: 0 6px;
  font-size: 10px; /* Small text */
  font-weight: 500;
  height: 18px;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.2s;
  border: 1px solid transparent;
}

.scope-select-trigger:hover:not(:disabled) {
  opacity: 0.8;
}

/* Badge Variants */
.scope-badge-user {
  background-color: var(--cursor-bg-secondary);
  color: var(--cursor-text-secondary);
  border-color: var(--cursor-stroke-primary);
}

.scope-badge-workspace {
  background-color: var(--cursor-bg-secondary);
  color: var(--cursor-text-secondary);
  border-color: var(--cursor-stroke-primary);
}

.scope-badge-local {
  background-color: var(--cursor-bg-secondary);
  color: var(--cursor-text-secondary);
  border-color: var(--cursor-stroke-primary);
}

.scope-badge-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: var(--vscode-descriptionForeground);
}

/* Content / Dropdown Styles */
:deep(.scope-select-content) {
  z-index: 1000;
  min-width: 120px;
  background-color: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border); /* using border var */
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  padding: 4px;
}

:deep(.scope-select-viewport) {
  padding: 2px;
}

:deep(.scope-select-item) {
  font-size: 12px; /* Standard dropdown text size */
  line-height: 1;
  color: var(--vscode-dropdown-foreground);
  border-radius: 3px;
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 24px 0 8px; /* space for indicator */
  position: relative;
  user-select: none;
  outline: none;
  cursor: pointer;
}

:deep(.scope-select-item[data-highlighted]) {
  background-color: var(--vscode-list-hoverBackground);
  color: var(--vscode-list-hoverForeground);
}

:deep(.scope-select-item[data-disabled]) {
  color: var(--vscode-disabledForeground);
  pointer-events: none;
}

:deep(.scope-select-item-indicator) {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
