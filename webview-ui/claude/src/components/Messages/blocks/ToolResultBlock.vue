<template>
  <!-- ToolResult is not rendered on its own; it is shown inside the matching ToolUse -->
  <div class="tool-result-standalone">
    <div class="tool-result-label">Tool Result (orphaned)</div>
    <pre class="tool-result-content">{{ formattedContent }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ToolResultBlock as ToolResultBlockType } from '../../../models/ContentBlock';

interface Props {
  block: ToolResultBlockType;
}

const props = defineProps<Props>();

const formattedContent = computed(() => {
  try {
    return typeof props.block.content === 'string'
      ? props.block.content
      : JSON.stringify(props.block.content, null, 2);
  } catch {
    return String(props.block.content);
  }
});
</script>

<style scoped>
.tool-result-standalone {
  margin: 8px 0;
  padding: 12px;
  background-color: var(--vscode-inputValidation-infoBackground);
  border-left: 3px solid var(--vscode-inputValidation-infoBorder);
  border-radius: 4px;
  opacity: 0.6;
}

.tool-result-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 4px;
}

.tool-result-content {
  font-size: 11px;
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-editor-foreground);
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
