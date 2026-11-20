<template>
  <Tooltip :content="fullPath" side="bottom">
    <button
      class="tool-filepath"
      role="button"
      tabindex="0"
      @click="handleClick"
    >
      <span class="filepath-name">{{ fileName }}</span>
    </button>
  </Tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Tooltip from '@/components/Common/Tooltip.vue';
import type { ToolContext } from '@/types/tool';

interface Props {
  filePath: string;
  context?: ToolContext;
  startLine?: number;
  endLine?: number;
}

const props = defineProps<Props>();

const fileName = computed(() => {
  if (!props.filePath) return '';
  // Simple path parsing (cross-platform)
  return props.filePath.split('/').pop() || props.filePath.split('\\').pop() || props.filePath;
});

const fullPath = computed(() => {
  return props.filePath;
});

function handleClick(event: MouseEvent) {
  event.stopPropagation();
  event.preventDefault();

  if (!props.context?.fileOpener) {
    console.warn('[ToolFilePath] No fileOpener available');
    return;
  }

  // Open the file and jump to the given line
  props.context.fileOpener.open(props.filePath, {
    startLine: props.startLine,
    endLine: props.endLine,
  });
}
</script>

<style scoped>
.tool-filepath {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 0px 4px;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
  color: var(--vscode-foreground);
  transition: background-color 0.2s;
}

.tool-filepath:hover {
  background-color: color-mix(
    in srgb,
    var(--vscode-list-hoverBackground) 50%,
    transparent
  );
}

.filepath-name {
  font-weight: 500;
  color: var(--vscode-textLink-foreground);
}
</style>
