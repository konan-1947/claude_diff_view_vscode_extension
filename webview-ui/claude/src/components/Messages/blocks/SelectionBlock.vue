<template>
  <div class="selection-block" @click="handleClick">
    <span class="selection-icon">📝</span>
    <span class="selection-label">{{ block.label }}</span>
  </div>
</template>

<script setup lang="ts">
import type { SelectionBlock as SelectionBlockType } from '../../../models/ContentBlock';
import type { ToolContext } from '../../../types/tool';

interface Props {
  block: SelectionBlockType;
  context?: ToolContext;
}

const props = defineProps<Props>();

function handleClick() {
  if (!props.context) return;

  props.context.fileOpener.open(props.block.filePath, {
    startLine: props.block.startLine,
    endLine: props.block.endLine
  });
}
</script>

<style scoped>
.selection-block {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
  padding: 6px 10px;
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.selection-block:hover {
  background-color: var(--vscode-list-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

.selection-icon {
  font-size: 12px;
}

.selection-label {
  font-size: 12px;
  color: var(--vscode-textLink-foreground);
  font-family: var(--vscode-editor-font-family);
}
</style>
