<template>
  <div :id="item.id || `item-${index}`" class="dropdown-menu-item-wrapper">
    <div
      ref="itemRef"
      class="dropdown-menu-item rounded"
      :class="{
        'selected': isSelected
      }"
      :data-is-selected="isSelected"
      @click="handleClick"
      @mouseenter="handleMouseEnter"
    >
      <div class="menu-item-main-content">
        <div class="menu-item-left-section">
          <!-- Icon area - shown only when there is an icon -->
          <span v-if="hasIcon" class="menu-item-icon-span">
            <!-- Custom icon content (via slot) -->
            <slot name="icon" :item="item">
              <!-- Default icon rendering -->
              <i v-if="item.icon" :class="`codicon ${item.icon}`"></i>
            </slot>
          </span>

          <!-- Text area -->
          <div class="menu-item-text-section">
            <!-- Main content -->
            <div class="file-info-container">
              <span class="monaco-highlighted-label">{{ item.label || item.name }}</span>
            </div>
            <!-- Secondary info (e.g. file path, description) -->
            <span
              v-if="item.detail"
              :class="item.type === 'command' ? 'description-container' : 'file-path-container'"
            >
              <span class="monaco-highlighted-label file-path-text">{{ item.detail }}</span>
            </span>
          </div>
        </div>

        <!-- Right-side status area -->
        <div v-if="item.rightIcon || item.checked" class="menu-item-right-section">
          <span v-if="item.checked" class="check-icon codicon codicon-check"></span>
          <span v-else-if="item.rightIcon" class="submenu-arrow-icon codicon" :class="item.rightIcon"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots, ref } from 'vue'
import type { DropdownItemData } from '../../types/dropdown'

interface Props {
  item: DropdownItemData
  isSelected?: boolean
  index: number
}

interface Emits {
  (e: 'click', item: DropdownItemData): void
  (e: 'mouseenter', index: number): void
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false
})

const emit = defineEmits<Emits>()
const slots = useSlots()

const itemRef = ref<HTMLElement>()

// Check whether there is an icon
const hasIcon = computed(() => {
  return !!props.item.icon || !!slots.icon
})

// Note: scrollIntoView is not used here because Dropdown uses a custom ScrollableElement
// ensureSelectedVisible() in Dropdown.vue handles scrolling
// Native scrollIntoView conflicts with transform-based scrolling and causes blank padding

function handleClick() {
  if (!props.item.disabled) {
    emit('click', props.item)
  }
}

function handleMouseEnter() {
  if (!props.item.disabled) {
    emit('mouseenter', props.index)
  }
}
</script>

<style scoped>
.dropdown-menu-item-wrapper {
  min-width: 0;
  overflow: hidden;
}

.dropdown-menu-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.125rem 0.375rem;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  cursor: pointer;
  color: var(--vscode-foreground);
  user-select: none;
}

/* Hover style: lighter highlight */
.dropdown-menu-item:hover {
  background-color: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
  color: var(--vscode-list-hoverForeground);
}

/* Disable hover styles in keyboard mode so they do not override selected */
[data-nav="keyboard"] .dropdown-menu-item:hover {
  background-color: transparent;
  color: inherit;
}

/* Selected style: stronger highlight + border */
.dropdown-menu-item.selected {
  background-color: color-mix(in srgb, var(--vscode-foreground) 20%, transparent);
  color: var(--vscode-list-hoverForeground);
  outline: 1px dotted var(--vscode-contrastActiveBorder);
  outline-offset: -1px;
}

/* Hover + selected together: selected wins, slightly darker background */
.dropdown-menu-item.selected:hover {
  background-color: color-mix(in srgb, var(--vscode-foreground) 25%, transparent);
  outline: 1px solid var(--vscode-contrastActiveBorder);
}

/* In keyboard mode, selected + hover keeps the selected style */
[data-nav="keyboard"] .dropdown-menu-item.selected:hover {
  background-color: color-mix(in srgb, var(--vscode-foreground) 20%, transparent);
  outline: 1px dotted var(--vscode-contrastActiveBorder);
}

.dropdown-menu-item:hover .file-info-container,
.dropdown-menu-item:hover .option-info-container,
.dropdown-menu-item:hover .file-path-container,
.dropdown-menu-item:hover .description-container,
.dropdown-menu-item.selected .file-info-container,
.dropdown-menu-item.selected .option-info-container,
.dropdown-menu-item.selected .file-path-container,
.dropdown-menu-item.selected .description-container {
  color: var(--vscode-panelTitle-activeForeground);
}

/* In keyboard mode, hover does not change the text color */
[data-nav="keyboard"] .dropdown-menu-item:hover .file-info-container,
[data-nav="keyboard"] .dropdown-menu-item:hover .option-info-container,
[data-nav="keyboard"] .dropdown-menu-item:hover .file-path-container,
[data-nav="keyboard"] .dropdown-menu-item:hover .description-container {
  color: inherit;
}


.menu-item-main-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.menu-item-left-section {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  overflow: hidden;
  flex: 1 1 0;
  height: 16px;
}

.menu-item-icon-span {
  flex-shrink: 0;
  width: 16px;
  min-width: 16px;
  color: var(--vscode-foreground);
  display: flex !important;
  align-items: center;
  justify-content: center;
  font-size: 12px !important;
}

.dropdown-menu-item:hover .menu-item-icon-span,
.dropdown-menu-item.selected .menu-item-icon-span {
  color: var(--vscode-list-activeSelectionForeground);
}

/* In keyboard mode, hover does not change the icon color */
[data-nav="keyboard"] .dropdown-menu-item:hover .menu-item-icon-span {
  color: var(--vscode-foreground);
}

.menu-item-text-section {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  flex: 1 1 0;
  gap: 0.25rem;
  height: 17px;
}

.file-info-container,
.option-info-container {
  color: var(--vscode-panelTitle-activeForeground);
  flex-shrink: 0;
  overflow: hidden;
}


.monaco-highlighted-label {
  color: inherit;
  font-size: 12px;
  line-height: 17px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  display: block;
  width: 100%;
}

.file-path-container {
  direction: rtl;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  color: var(--vscode-panelTitle-activeForeground);
  flex-shrink: 1;
  opacity: 0.6;
}

/* Command description container: no rtl, truncate the trailing text */
.description-container {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  color: var(--vscode-panelTitle-activeForeground);
  flex-shrink: 1;
  opacity: 0.6;
}


.file-path-text {
  font-size: 9px;
  line-height: 17px;
  unicode-bidi: embed;
}

.menu-item-right-section {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-left: 0.25rem;
}

.submenu-arrow-icon {
  color: var(--vscode-foreground);
  margin-right: 0 !important;
  font-size: 8px !important;
  flex-shrink: 0;
  opacity: 0.6;
}

.dropdown-menu-item:hover .submenu-arrow-icon,
.dropdown-menu-item.selected .submenu-arrow-icon {
  color: var(--vscode-list-activeSelectionForeground);
  opacity: 1;
}

/* In keyboard mode, hover does not change the arrow icon */
[data-nav="keyboard"] .dropdown-menu-item:hover .submenu-arrow-icon {
  color: var(--vscode-foreground);
  opacity: 0.6;
}

.check-icon {
  color: var(--vscode-foreground);
  margin-right: 0 !important;
  font-size: 8px !important;
  flex-shrink: 0;
}

.dropdown-menu-item:hover .check-icon,
.dropdown-menu-item.selected .check-icon {
  color: var(--vscode-list-activeSelectionForeground);
}

/* In keyboard mode, hover does not change the check icon */
[data-nav="keyboard"] .dropdown-menu-item:hover .check-icon {
  color: var(--vscode-foreground);
}

.highlight {
  color: var(--vscode-list-highlightForeground);
  font-weight: 700;
}


.codicon:not(.bg-codicon-icon) {
  font-size: 12px !important;
}
</style>
