<template>
  <SelectRoot v-model="model">
    <SelectTrigger class="profile-select-trigger">
      <div class="flex items-center gap-2 overflow-hidden">
        <span class="codicon codicon-account" style="font-size: 14px"></span>
        <span class="truncate block">{{ currentLabel }}</span>
      </div>
      <span class="codicon codicon-chevron-down" style="font-size: 12px; opacity: 0.8"></span>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        class="profile-select-content"
        :side-offset="5"
        position="popper"
        align="start"
      >
        <SelectViewport class="profile-select-viewport">
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="profile-select-item"
            :class="{
              'border-t border-[var(--vscode-dropdown-border)] mt-1 pt-1':
                option.value === 'manage_profiles'
            }"
          >
            <SelectItemText>
              {{ option.label }}
            </SelectItemText>
            <SelectItemIndicator
              v-if="option.value !== 'manage_profiles'"
              class="profile-select-item-indicator"
            >
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
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator
} from 'reka-ui';

interface Option {
  label: string;
  value: string;
  description?: string;
}

const props = defineProps<{
  modelValue: string; // 'default' or profile name or 'manage_profiles'
  options: Option[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const model = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val)
});

const currentLabel = computed(() => {
  // If manage_profiles is selected, we probably don't want to show "Manage Profiles" as the value,
  // but the parent will likely switch tabs and keep the old profile active.
  // However, for the display, we show the label of the *current* modelValue.
  const opt = props.options.find((o) => o.value === props.modelValue);
  return opt ? opt.label : props.modelValue;
});
</script>

<style scoped>
.profile-select-trigger {
  all: unset;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  color: var(--vscode-input-foreground);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  gap: 8px;
}

.profile-select-trigger:hover {
  border-color: var(--vscode-focusBorder);
}

.profile-select-trigger:focus-visible {
  outline: 1px solid var(--vscode-focusBorder);
}

:global(.profile-select-content) {
  z-index: 1000;
  min-width: var(--reka-select-trigger-width); /* Match trigger width */
  background-color: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 6px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
  padding: 4px;
}

:global(.profile-select-viewport) {
  padding: 2px;
}

:global(.profile-select-item) {
  font-size: 12px;
  line-height: 1;
  color: var(--vscode-dropdown-foreground);
  border-radius: 3px;
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 24px 0 8px;
  position: relative;
  user-select: none;
  outline: none;
  cursor: pointer;
}

:global(.profile-select-item[data-highlighted]) {
  background-color: var(--vscode-list-hoverBackground);
  color: var(--vscode-list-hoverForeground);
}

:global(.profile-select-item-indicator) {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
