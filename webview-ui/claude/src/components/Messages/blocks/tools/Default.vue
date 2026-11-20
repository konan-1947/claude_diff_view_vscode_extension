<template>
  <ToolMessageWrapper
    tool-icon="codicon-tools"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="tool-label">{{ toolName }}</span>
    </template>

    <template #expandable>
      <!-- Parameter list -->
      <div v-if="hasParams" class="params-list">
        <div v-for="(value, key) in flatParams" :key="key" class="param-row">
          <span class="param-key">{{ key }}:</span>
          <span class="param-value" :class="getValueClass(value)">{{ formatValue(value) }}</span>
        </div>
      </div>

      <!-- Empty parameters hint -->
      <div v-if="!hasParams" class="empty-params">
        <span class="codicon codicon-info"></span>
        No parameters
      </div>

      <!-- Error content -->
      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

const props = defineProps<Props>();

// Tool name
const toolName = computed(() => {
  return props.toolUse?.name || 'Unknown Tool';
});

// Get the input parameters
const input = computed(() => {
  // Prefer toolUseResult (session load)
  if (props.toolUseResult?.input) {
    return props.toolUseResult.input;
  }

  // Live conversation
  if (props.toolUse?.input) {
    return props.toolUse.input;
  }

  return null;
});

// Flatten all parameters
const flatParams = computed(() => {
  if (!input.value || typeof input.value !== 'object') {
    return {};
  }

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(input.value)) {
    result[key] = value;
  }

  return result;
});

const hasParams = computed(() => {
  return Object.keys(flatParams.value).length > 0;
});

// Whether this is the permission request phase
const isPermissionRequest = computed(() => {
  const hasToolUseResult = !!props.toolUseResult;
  const hasToolResult = !!props.toolResult && !props.toolResult.is_error;
  return !hasToolUseResult && !hasToolResult;
});

// Expanded by default during the permission request phase, collapsed once done
const shouldExpand = computed(() => {
  // Expand during the permission request phase
  if (isPermissionRequest.value && hasParams.value) return true;

  // Expand when there is an error
  if (props.toolResult?.is_error) return true;

  return false;
});

function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function getValueClass(value: any): string {
  if (typeof value === 'boolean') return 'value-boolean';
  if (typeof value === 'number') return 'value-number';
  if (typeof value === 'object') return 'value-object';
  if (typeof value === 'string') {
    if (value.startsWith('/') || value.includes('\\')) return 'value-path';
    if (value.includes('http')) return 'value-url';
  }
  return 'value-string';
}
</script>

<style scoped>
.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.params-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.85em;
}

.param-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.param-key {
  color: color-mix(in srgb, var(--vscode-foreground) 70%, transparent);
  font-weight: 500;
  font-family: var(--vscode-editor-font-family);
  flex-shrink: 0;
  min-width: fit-content;
}

.param-value {
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family);
  flex: 1;
  word-break: break-word;
  white-space: pre-wrap;
}

.value-boolean {
  color: var(--vscode-charts-orange);
  font-weight: 500;
}

.value-number {
  color: var(--vscode-charts-blue);
  font-weight: 500;
}

.value-path {
  color: var(--vscode-charts-green);
  font-style: italic;
}

.value-url {
  color: var(--vscode-charts-purple);
  text-decoration: underline;
}

.value-object {
  color: var(--vscode-foreground);
  opacity: 0.9;
}

.empty-params {
  display: flex;
  align-items: center;
  gap: 6px;
  color: color-mix(in srgb, var(--vscode-foreground) 60%, transparent);
  font-style: italic;
  font-size: 0.85em;
  padding: 8px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 30%, transparent);
  border-radius: 4px;
  border: 1px dashed var(--vscode-panel-border);
}
</style>
