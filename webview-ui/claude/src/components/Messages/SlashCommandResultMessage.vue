<template>
  <div :class="resultClasses">
    <div class="command-result-header">
      <span class="command-icon codicon" :class="iconClass"></span>
      <span class="command-label">{{ headerLabel }}</span>
    </div>
    <pre class="command-result-content custom-scrollbar">{{ resultContent }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Message } from '../../models/Message';
import type { SlashCommandResultBlock } from '../../models/ContentBlock';

interface Props {
  message: Message;
  context?: any; // passed by MessageRenderer; declared so it is not rendered into the DOM
}

const props = defineProps<Props>();

// Extract the SlashCommandResultBlock data
const resultBlock = computed<SlashCommandResultBlock | null>(() => {
  const content = props.message.message.content;
  if (Array.isArray(content) && content.length === 1) {
    const block = content[0].content;
    if (block.type === 'slash_command_result') {
      return block as SlashCommandResultBlock;
    }
  }
  return null;
});

const resultContent = computed(() => resultBlock.value?.result || '');
const isError = computed(() => resultBlock.value?.isError || false);

const resultClasses = computed(() => {
  const classes = ['slash-command-result-message'];
  if (isError.value) {
    classes.push('command-error');
  } else {
    classes.push('command-success');
  }
  return classes;
});

const iconClass = computed(() => {
  return isError.value ? 'codicon-error' : 'codicon-pass';
});

const headerLabel = computed(() => {
  return isError.value ? 'Command Error' : 'Command Output';
});
</script>

<style scoped>
.slash-command-result-message {
  margin: 4px 12px;
  border-radius: 4px;
  overflow: hidden;
  font-family: var(--vscode-editor-font-family);
  margin-bottom: 16px !important;
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
  font-size: 14px;
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
  opacity: 0.9;
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
  overflow-x: hidden;
}
</style>
