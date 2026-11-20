<template>
  <div class="opened-file-block" @click="handleClick">
    <span class="file-icon">📂</span>
    <span class="file-label">Opened: {{ block.label }}</span>
  </div>
</template>

<script setup lang="ts">
import type { OpenedFileBlock as OpenedFileBlockType } from '../../../models/ContentBlock';
import type { ToolContext } from '../../../types/tool';

interface Props {
  block: OpenedFileBlockType;
  context?: ToolContext;
}

const props = defineProps<Props>();

function handleClick() {
  if (!props.context) return;

  props.context.fileOpener.open(props.block.filePath);
}
</script>

<style scoped>
.opened-file-block {
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

.opened-file-block:hover {
  background-color: var(--vscode-list-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

.file-icon {
  font-size: 12px;
}

.file-label {
  font-size: 12px;
  color: var(--vscode-textLink-foreground);
  font-family: var(--vscode-editor-font-family);
}
</style>
