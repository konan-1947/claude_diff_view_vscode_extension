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
      <div class="mode-dropdown" :title="selectedMode.description">
        <div class="dropdown-content">
          <div :class="['codicon', selectedMode.icon, 'dropdown-icon', 'text-[14px]!']" />
          <div class="dropdown-text">
            <span class="dropdown-label">{{ selectedMode.label }}</span>
          </div>
        </div>
        <div class="codicon codicon-chevron-down chevron-icon text-[14px]!" />
      </div>
    </template>

    <template #content="{ close }">
      <DropdownItem
        v-for="(mode, idx) in modes"
        :key="mode.id"
        :item="{
          id: mode.id,
          label: mode.label,
          detail: mode.description,
          icon: `${mode.icon} text-[14px]!`,
          checked: permissionMode === mode.id,
          type: 'permission-mode'
        }"
        :is-selected="activeIndex === idx"
        :index="idx"
        stacked
        @click="(item) => handleModeSelect(item, close)"
        @mouseenter="onMouseEnter"
      />
    </template>
  </DropdownTrigger>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import { DropdownTrigger, DropdownItem, type DropdownItemData } from './Dropdown'
import { describeMode, type ModeOption } from '../utils/permissionModes'
import { usePickerKeyboard } from '../composables/usePickerKeyboard'

interface Props {
  permissionMode?: PermissionMode
  /** Modes to offer, from availableModes() (driven by the CLI's model capabilities) */
  modes?: ModeOption[]
}

interface Emits {
  (e: 'modeSelect', mode: PermissionMode): void
}

const props = withDefaults(defineProps<Props>(), {
  permissionMode: 'default',
  modes: () => []
})

const emit = defineEmits<Emits>()

const selectedMode = computed(() => describeMode(props.permissionMode))

const triggerRef = ref<InstanceType<typeof DropdownTrigger>>()
const { activeIndex, navMode, onOpen, onClose, onMouseEnter } = usePickerKeyboard({
  trigger: triggerRef,
  count: () => props.modes.length,
  currentIndex: () => props.modes.findIndex((m) => m.id === props.permissionMode),
  onPick: (index) => emit('modeSelect', props.modes[index].id as PermissionMode)
})

function handleModeSelect(item: DropdownItemData, close: () => void) {
  close()
  emit('modeSelect', item.id as PermissionMode)
}
</script>

<style scoped>
/* Mode dropdown style - matches the Agent button style */
.mode-dropdown {
  display: flex;
  gap: 4px;
  font-size: 12px;
  align-items: center;
  line-height: 16.8px;
  min-width: 0;
  max-width: 100%;
  /* 8px left / 6px right: the chevron glyph adds ~2px of its own on the
     right, so both sides read the same */
  padding: 2px 6px 2px 8px;
  border-radius: 9999px;
  flex-shrink: 0;
  cursor: pointer;
  border: none;
  background: var(--cs-fg-14);
  transition: background-color 0.2s ease;
  opacity: .8;
  user-select: none;
}

.mode-dropdown:hover {
  opacity: 1;
}

.dropdown-content {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.dropdown-icon {
  font-size: 16px !important;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex !important;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
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
