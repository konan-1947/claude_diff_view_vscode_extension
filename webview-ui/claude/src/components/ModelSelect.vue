<template>
  <DropdownTrigger
    align="left"
    :close-on-click-outside="true"
  >
    <template #trigger>
      <div class="model-dropdown">
        <div class="dropdown-content">
          <div class="dropdown-text">
            <span class="dropdown-label">{{ selectedModelLabel }}</span>
          </div>
        </div>
        <div class="codicon codicon-chevron-down chevron-icon text-[14px]!" />
      </div>
    </template>

    <template #content="{ close }">
      <DropdownItem
        v-for="(model, idx) in availableModels"
        :key="model.id"
        :item="{
          id: model.id,
          label: model.label,
          detail: model.description,
          checked: selectedModel === model.id,
          type: 'model'
        }"
        :is-selected="selectedModel === model.id"
        :index="idx"
        @click="(item) => handleModelSelect(item, close)"
      />
    </template>
  </DropdownTrigger>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DropdownTrigger, DropdownItem, type DropdownItemData } from './Dropdown'
import { useModelCatalog } from '../composables/useModelCatalog'

interface Props {
  selectedModel?: string
}

interface Emits {
  (e: 'modelSelect', modelId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  selectedModel: 'default'
})

const emit = defineEmits<Emits>()

// The list comes from the CLI (plus custom models from Settings); see useModelCatalog.
const { availableModels, labelFor } = useModelCatalog()

const selectedModelLabel = computed(() => labelFor(props.selectedModel) || 'Select model')

function handleModelSelect(item: DropdownItemData, close: () => void) {
  close()
  emit('modelSelect', item.id)
}
</script>

<style scoped>
/* Model dropdown style - simple transparent style */
.model-dropdown {
  display: flex;
  gap: 4px;
  font-size: 12px;
  align-items: center;
  line-height: 16.8px;
  min-width: 0;
  max-width: 100%;
  /* Same 2px vertical padding and 16.8px line as the mode pill, so the
     three controls share one height and centre line */
  padding: 2px 6px;
  border-radius: 23px;
  flex-shrink: 1;
  cursor: pointer;
  border: none;
  background: transparent;
  overflow: hidden;
  transition: background-color 0.2s ease;
  user-select: none;
}

.model-dropdown:hover {
  background-color: var(--vscode-inputOption-hoverBackground);
}

/* Shared Dropdown styles */
.dropdown-content {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.dropdown-text {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 12px;
  display: flex;
  align-items: baseline;
  gap: 3px;
  height: 13px;
  font-weight: 400;
}

.dropdown-label {
  opacity: 0.8;
  max-width: 120px;
  overflow: hidden;
  height: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.chevron-icon {
  font-size: 9px;
  flex-shrink: 0;
  opacity: 0.5;
  color: var(--vscode-foreground);
}
</style>
