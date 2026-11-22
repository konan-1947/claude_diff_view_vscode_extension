<template>
  <DropdownTrigger
    ref="triggerRef"
    align="left"
    fit-content
    :close-on-click-outside="true"
    :selected-index="activeIndex"
    :data-nav="navMode"
    @open="onOpen"
    @close="onClose"
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
        :is-selected="activeIndex === idx"
        :index="idx"
        stacked
        @click="(item) => handleModelSelect(item, close)"
        @mouseenter="onMouseEnter"
      />
    </template>
  </DropdownTrigger>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { DropdownTrigger, DropdownItem, type DropdownItemData } from './Dropdown'
import { useModelCatalog } from '../composables/useModelCatalog'
import { usePickerKeyboard } from '../composables/usePickerKeyboard'

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

const triggerRef = ref<InstanceType<typeof DropdownTrigger>>()

// Lets `/model` (no argument) open this picker, like the CLI's model menu.
defineExpose({
  open: () => triggerRef.value?.open()
})

const { activeIndex, navMode, onOpen, onClose, onMouseEnter } = usePickerKeyboard({
  trigger: triggerRef,
  count: () => availableModels.value.length,
  currentIndex: () => availableModels.value.findIndex((m) => m.id === props.selectedModel),
  onPick: (index) => emit('modelSelect', availableModels.value[index].id)
})

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
  padding: 2px 6px 2px 8px;
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
  line-height: 16px;
  display: flex;
  align-items: center;
  gap: 3px;
  height: 16px;
  font-weight: 400;
}

.dropdown-label {
  opacity: 0.8;
  max-width: 120px;
  overflow: hidden;
  line-height: 16px;
  height: 16px;
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
