<template>
  <div :class="resultClasses">
    <div class="command-result-header">
      <span class="command-icon">{{ block.isError ? '❌' : '✓' }}</span>
      <span class="command-label">Command {{ block.isError ? 'Error' : 'Output' }}</span>
    </div>
    <pre class="command-result-content">{{ block.result }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SlashCommandResultBlock as SlashCommandResultBlockType } from '../../../models/ContentBlock';

interface Props {
  block: SlashCommandResultBlockType;
}

const props = defineProps<Props>();

const resultClasses = computed(() => {
  const classes = ['command-result-block'];
  if (props.block.isError) {
    classes.push('command-error');
  } else {
    classes.push('command-success');
  }
  return classes;
});
</script>

<style scoped>
.command-result-block {
  margin: 8px 0;
  border-radius: 4px;
  overflow: hidden;
}

.command-success {
  border: 1px solid var(--vscode-testing-iconPassed);
}

.command-error {
  border: 1px solid var(--vscode-testing-iconFailed);
}

.command-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background-color: var(--vscode-editor-background);
}

.command-success .command-result-header {
  border-bottom: 1px solid var(--vscode-testing-iconPassed);
}

.command-error .command-result-header {
  border-bottom: 1px solid var(--vscode-testing-iconFailed);
}

.command-icon {
  font-size: 12px;
}

.command-success .command-icon {
  color: var(--vscode-testing-iconPassed);
}

.command-error .command-icon {
  color: var(--vscode-testing-iconFailed);
}

.command-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--vscode-editor-foreground);
}

.command-result-content {
  padding: 10px 12px;
  margin: 0;
  font-size: 11px;
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-editor-foreground);
  background-color: var(--vscode-textCodeBlock-background);
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 300px;
  overflow-y: auto;
}
</style>
