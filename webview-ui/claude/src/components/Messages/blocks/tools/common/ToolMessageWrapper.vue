<template>
  <div
    class="tool-message-wrapper"
    :class="{ 'is-card': !isCustomLayout, 'is-open': isExpanded && hasExpandableContent }"
  >
    <!-- Custom layout mode -->
    <template v-if="isCustomLayout">
      <slot name="custom"></slot>
    </template>

    <!-- Standard layout mode -->
    <template v-else>
      <!-- Main info row -->
      <div
        class="main-line"
        :class="{ 'is-expandable': hasExpandableContent }"
        @click="toggleExpand"
      >
        <!-- Tool icon -->
        <Tooltip :content="toolName">
          <span class="tool-icon-btn">
            <slot name="icon"><span class="codicon" :class="toolIcon"></span></slot>
          </span>
        </Tooltip>

        <!-- Main content -->
        <div class="main-content">
          <slot name="main"></slot>
        </div>

        <!-- Status indicator -->
        <ToolStatusIndicator
          v-if="indicatorState"
          :state="indicatorState"
          class="status-indicator-trailing"
        />

        <!-- Expand chevron -->
        <span
          v-if="hasExpandableContent"
          class="codicon codicon-chevron-right expand-chevron"
          :class="{ expanded: isExpanded }"
        ></span>
      </div>

      <!-- Expanded content -->
      <div v-if="hasExpandableContent && isExpanded" class="expandable-content">
        <slot name="expandable"></slot>
      </div>

      <!-- Collapsed preview (e.g. the first line of command output) -->
      <div v-else-if="$slots.preview" class="preview-content" @click="toggleExpand">
        <slot name="preview"></slot>
      </div>
    </template>

    <!-- Permission approval buttons -->
    <div v-if="permissionState === 'pending'" class="permission-actions">
      <button @click.stop="$emit('deny')" class="btn-reject">
        <span>Reject</span>
      </button>
      <button @click.stop="$emit('allow')" class="btn-accept">
        <span>Accept</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useSlots, watch } from 'vue';
import { transcriptDetail } from '../../../../../composables/useTranscriptDetail';
import Tooltip from '@/components/Common/Tooltip.vue';
import ToolStatusIndicator from './ToolStatusIndicator.vue';

interface Props {
  toolIcon?: string;
  toolName?: string;
  toolResult?: any;
  permissionState?: string;
  defaultExpanded?: boolean;
  isCustomLayout?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  defaultExpanded: false,
  isCustomLayout: false,
  toolIcon: 'codicon-tools',
  toolName: 'Tool',
});

defineEmits<{
  allow: [];
  deny: [];
}>();

const slots = useSlots();

// Detect whether there is expandable content
const hasExpandableContent = computed(() => {
  return !!slots.expandable || !!props.toolResult?.is_error;
});

// Expanded state
const userToggled = ref(false);
const userToggledState = ref(false);

const isExpanded = computed({
  get: () => {
    // Prefer the state the user toggled manually
    if (userToggled.value) {
      return userToggledState.value;
    }
    // Every card starts closed (diffs, errors and permission previews too): the
    // user opens what they want to see. An error still shows its red dot.
    // Ctrl+O (detailed transcript) opens them all.
    return transcriptDetail.value;
  },
  set: (value) => {
    userToggled.value = true;
    userToggledState.value = value;
  },
});

// Ctrl+O on or off drops the manual toggle: every card follows the switch
watch(transcriptDetail, () => {
  userToggled.value = false;
});

// State computation
const indicatorState = computed<'success' | 'error' | 'pending' | null>(() => {
  if (props.toolResult?.is_error) return 'error';
  if (props.permissionState === 'pending') return 'pending';
  // Cursor shows no marker for a finished tool; only pending and failed ones get a dot
  return null;
});

// Toggle expansion
function toggleExpand() {
  if (hasExpandableContent.value) {
    isExpanded.value = !isExpanded.value;
  }
}
</script>

<style scoped>
.tool-message-wrapper {
  display: flex;
  flex-direction: column;
  padding: 2px 12px;
}

/* Card: one compact rounded row; expands in place */
.tool-message-wrapper.is-card {
  margin: 0;
  padding: 0;
  /* Cursor tokens: --cursor-stroke-secondary (fg 12%), --cursor-radius-xl (12px) */
  border: 1px solid color-mix(in srgb, var(--vscode-editor-foreground) 12%, transparent);
  border-radius: 12px;
  background: var(--vscode-editor-background);
  overflow: hidden;
  contain: paint;
}

.main-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 8px;
  font-size: 13px;
  line-height: 22px;
  user-select: none;
}

.preview-content {
  padding: 6px 10px;
  border-top: 1px solid var(--cs-fg-12);
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 13px;
  line-height: 18px;
  color: var(--cs-fg-36);
  cursor: pointer;
}

/* Open card: divider under the header, like composer-tool-call-simple-layout-header */
.tool-message-wrapper.is-open .main-line {
  border-bottom: 1px solid color-mix(in srgb, var(--vscode-editor-foreground) 12%, transparent);
}

.main-line.is-expandable {
  cursor: pointer;
}

.main-line.is-expandable:hover {
  background-color: color-mix(in srgb, var(--vscode-editor-foreground) 4%, transparent);
}

.tool-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in srgb, var(--vscode-editor-foreground) 60%, transparent);
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.tool-icon-btn .codicon {
  font-size: 15px;
}

.main-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

/* Long labels/paths truncate instead of wrapping the card */
.main-content > :slotted(*) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-indicator-trailing {
  margin-left: auto;
}

.expand-chevron {
  font-size: 14px;
  color: color-mix(in srgb, var(--vscode-editor-foreground) 60%, transparent);
  flex-shrink: 0;
  opacity: 0;
  transition: transform 100ms ease, opacity 100ms ease;
}

.expand-chevron.expanded {
  transform: rotate(90deg);
}

/* Cursor cards carry no permanent chevron; it shows while the header is hovered */
.main-line:hover .expand-chevron {
  opacity: 1;
}

.expandable-content {
  padding: 4px 8px;
  max-height: 480px;
  overflow-y: auto;
}

/* Permission approval buttons */
.permission-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 0 4px;
  padding: 8px 10px 10px;
}

.btn-reject,
.btn-accept {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.9em;
  cursor: pointer;
  border: 1px solid var(--vscode-button-border);
}

.btn-reject {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-reject:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn-accept {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-accept:hover {
  background: var(--vscode-button-hoverBackground);
}
</style>
