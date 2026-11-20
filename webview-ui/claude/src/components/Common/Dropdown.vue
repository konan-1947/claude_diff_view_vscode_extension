<template>
  <SelectRoot v-bind="forwarded">
    <SelectTrigger class="solid-dropdown-toggle">
      <div class="solid-dropdown-toggle-label">
        <slot name="trigger" :selected="selectedOption">
          <SelectValue :placeholder="placeholder">
            {{ selectedOption?.label }}
          </SelectValue>
        </slot>
      </div>
      <span class="codicon codicon-chevron-up-down" style="color: var(--cursor-icon-primary);"></span>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent class="solid-dropdown-menu" :position="'popper'" :align="menuAlign === 'right' ? 'end' : 'start'" :side-offset="4">
        <SelectViewport>
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="solid-dropdown-item"
          >
            <slot name="option" :option="option">
              <div>
                <div style="font-size: 12px;">{{ option.label }}</div>
                <div v-if="option.description" style="font-size: 10px; opacity: 0.5;">{{ option.description }}</div>
              </div>
            </slot>
          </SelectItem>

          <div v-if="$slots.footer" class="solid-dropdown-item footer-item">
            <slot name="footer"></slot>
          </div>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  SelectRoot,
  SelectTrigger,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectValue,
  useForwardPropsEmits
} from 'reka-ui';

interface Option {
  label: string
  value: any
  description?: string
}

const props = defineProps<{
  modelValue?: any
  options: Option[]
  placeholder?: string
  menuAlign?: 'left' | 'right'
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void
}>()

const forwarded = useForwardPropsEmits(computed(() => ({
  modelValue: props.modelValue,
})), emit)

const selectedOption = computed(() => {
  return props.options.find(o => o.value === props.modelValue)
})
</script>

<style scoped>
.solid-dropdown-toggle {
    align-items: center;
    background-color: transparent;
    border: 1px solid var(--cursor-stroke-primary);
    border-radius: 6px;
    color: var(--cursor-text-primary);
    cursor: pointer;
    display: flex;
    font-family: inherit;
    font-size: 12px;
    gap: 10px;
    padding: 3px 2px 3px 6px;
    outline: none;
    user-select: none;
}

.solid-dropdown-toggle-label {
    align-items: center;
    display: flex;
    text-align: left;
}

:global(.solid-dropdown-menu) {
    background-color: var(--vscode-settings-dropdownBackground);
    border: 1px solid var(--vscode-settings-dropdownBorder);
    border-radius: 6px;
    box-shadow: 0 0 0 0 rgba(0,0,0,.1);
    display: flex;
    flex-direction: column;
    min-width: 160px;
    max-width: 150px;
    padding-left: 0;
    z-index: 1000;
    list-style: none;
    padding: 0;
}

:global(.solid-dropdown-item) {
    color: var(--vscode-foreground);
    display: block;
    font-size: 12px;
    opacity: .6;
    padding: 5px 8px;
    text-decoration: none;
    outline: none;
    cursor: pointer;
    user-select: none;
    white-space: normal;
    word-break: break-word;
}

:global(.solid-dropdown-item[data-highlighted]) {
    opacity: 1;
    outline: none;
}

:global(.footer-item) {
    cursor: default;
}
</style>
