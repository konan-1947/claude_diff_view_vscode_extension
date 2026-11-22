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
      <div class="effort-dropdown" :title="`Effort: ${selectedLabel}`">
        <div class="codicon codicon-dashboard text-[13px]! effort-icon" />
        <span class="dropdown-label">{{ selectedLabel }}</span>
        <div class="codicon codicon-chevron-down chevron-icon text-[14px]!" />
      </div>
    </template>

    <template #content="{ close }">
      <DropdownItem
        v-for="(opt, idx) in options"
        :key="opt.id"
        :item="{
          id: opt.id,
          label: opt.label,
          detail: opt.detail,
          checked: effortLevel === opt.id,
          type: 'effort'
        }"
        :is-selected="activeIndex === idx"
        :index="idx"
        stacked
        @click="(item) => handleSelect(item, close)"
        @mouseenter="onMouseEnter"
      />
    </template>
  </DropdownTrigger>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { DropdownTrigger, DropdownItem, type DropdownItemData } from './Dropdown'
import { usePickerKeyboard } from '../composables/usePickerKeyboard'

interface Props {
  /** Current level; "auto" = the model's default */
  effortLevel?: string
  /** Levels the CLI lists for the selected model (ModelInfo.supportedEffortLevels) */
  levels?: string[]
}

interface Emits {
  (e: 'effortSelect', level: string): void
}

const props = withDefaults(defineProps<Props>(), {
  effortLevel: 'auto',
  levels: () => []
})

const emit = defineEmits<Emits>()

// Known names only get a nicer label; any other level the CLI lists is shown as is.
const KNOWN_LABELS: Record<string, string> = {
  auto: 'Auto',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
}

function labelOf(level: string): string {
  return KNOWN_LABELS[level] ?? level
}

const options = computed(() => [
  { id: 'auto', label: 'Auto', detail: "The model's default" },
  ...props.levels.map((level) => ({ id: level, label: labelOf(level), detail: undefined })),
])

const selectedLabel = computed(() => labelOf(props.effortLevel))

const triggerRef = ref<InstanceType<typeof DropdownTrigger>>()
const { activeIndex, navMode, onOpen, onClose, onMouseEnter } = usePickerKeyboard({
  trigger: triggerRef,
  count: () => options.value.length,
  currentIndex: () => options.value.findIndex((o) => o.id === props.effortLevel),
  onPick: (index) => emit('effortSelect', options.value[index].id)
})

function handleSelect(item: DropdownItemData, close: () => void) {
  close()
  emit('effortSelect', item.id)
}
</script>

<style scoped>
.effort-dropdown {
  display: flex;
  gap: 3px;
  font-size: 12px;
  align-items: center;
  line-height: 16.8px;
  min-width: 0;
  padding: 2px 6px 2px 8px;
  border-radius: 23px;
  flex-shrink: 1;
  cursor: pointer;
  background: transparent;
  overflow: hidden;
  transition: background-color 0.2s ease;
  user-select: none;
}

.effort-dropdown:hover {
  background-color: var(--vscode-inputOption-hoverBackground);
}

.effort-icon {
  /* fixed 16px box like the mode pill's icon, so it centres with the label */
  font-size: 14px !important;
  width: 16px;
  height: 16px;
  display: flex !important;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  flex-shrink: 0;
}

.dropdown-label {
  opacity: 0.8;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 16px;
  height: 16px;
}

.chevron-icon {
  font-size: 9px;
  flex-shrink: 0;
  opacity: 0.5;
  color: var(--vscode-foreground);
}
</style>
