<template>
  <div class="diagnostics-block">
    <div class="diagnostics-header">
      <span class="diagnostics-icon">🔍</span>
      <span class="diagnostics-label">Diagnostics ({{ block.diagnostics.length }})</span>
    </div>
    <div class="diagnostics-list">
      <div
        v-for="(diagnostic, index) in block.diagnostics"
        :key="index"
        :class="['diagnostic-item', `diagnostic-${diagnostic.severity}`]"
        @click="() => handleClick(diagnostic)"
      >
        <div class="diagnostic-location">
          {{ diagnostic.filePath }}:{{ diagnostic.line }}:{{ diagnostic.column }}
        </div>
        <div class="diagnostic-message">{{ diagnostic.message }}</div>
        <div v-if="diagnostic.code" class="diagnostic-code">{{ diagnostic.code }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  DiagnosticsBlock as DiagnosticsBlockType,
  DiagnosticsEntry
} from '../../../models/ContentBlock';
import type { ToolContext } from '../../../types/tool';

interface Props {
  block: DiagnosticsBlockType;
  context?: ToolContext;
}

const props = defineProps<Props>();

function handleClick(diagnostic: DiagnosticsEntry) {
  if (!props.context) return;

  props.context.fileOpener.open(diagnostic.filePath, {
    startLine: diagnostic.line,
    endLine: diagnostic.line
  });
}
</script>

<style scoped>
.diagnostics-block {
  margin: 8px 0;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  overflow: hidden;
}

.diagnostics-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--vscode-editor-background);
}

.diagnostics-icon {
  font-size: 12px;
}

.diagnostics-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-editor-foreground);
}

.diagnostics-list {
  max-height: 200px;
  overflow-y: auto;
}

.diagnostic-item {
  padding: 8px 12px;
  border-top: 1px solid var(--vscode-panel-border);
  cursor: pointer;
  transition: background-color 0.2s;
}

.diagnostic-item:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.diagnostic-error {
  border-left: 3px solid var(--vscode-testing-iconFailed);
}

.diagnostic-warning {
  border-left: 3px solid var(--vscode-inputValidation-warningBorder);
}

.diagnostic-location {
  font-size: 11px;
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-textLink-foreground);
  margin-bottom: 4px;
}

.diagnostic-message {
  font-size: 12px;
  color: var(--vscode-editor-foreground);
  margin-bottom: 2px;
}

.diagnostic-code {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  font-family: var(--vscode-editor-font-family);
}
</style>
