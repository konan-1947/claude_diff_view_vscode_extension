<template>
  <ToolMessageWrapper
    tool-icon="codicon-mcp"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="mcp-label">MCP</span>
      <span class="server-badge">{{ serverName }}</span>
      <span class="tool-name">{{ toolName }}</span>
    </template>

    <template #expandable>
      <!-- Input parameters -->
      <div v-if="hasInput" class="mcp-section">
        <div class="section-header">
          <span class="codicon codicon-symbol-parameter"></span>
          <span>Input</span>
        </div>
        <pre class="json-content">{{ formattedInput }}</pre>
      </div>

      <!-- Output -->
      <div v-if="hasOutput" class="mcp-section">
        <div class="section-header">
          <span class="codicon codicon-output"></span>
          <span>Output</span>
        </div>
        <pre class="json-content">{{ formattedOutput }}</pre>
      </div>

      <!-- Error info -->
      <div v-if="toolResult?.is_error" class="error-section">
        <div class="section-header">
          <span class="codicon codicon-error"></span>
          <span>Error</span>
        </div>
        <pre class="error-content">{{ errorMessage }}</pre>
      </div>
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

const props = defineProps<Props>();

// Parse the MCP tool name: mcp__<server>__<tool>
const mcpParts = computed(() => {
  const name = props.toolUse?.name || '';
  const parts = name.split('__');

  if (parts.length >= 3 && parts[0] === 'mcp') {
    return {
      server: parts[1],
      tool: parts.slice(2).join('__')
    };
  }

  return {
    server: 'unknown',
    tool: name
  };
});

const serverName = computed(() => mcpParts.value.server);
const toolName = computed(() => mcpParts.value.tool);

// Input parameters
const hasInput = computed(() => {
  const input = props.toolUse?.input || props.toolUseResult?.input;
  return input && Object.keys(input).length > 0;
});

const formattedInput = computed(() => {
  const input = props.toolUse?.input || props.toolUseResult?.input;
  return JSON.stringify(input, null, 2);
});

// Output
const hasOutput = computed(() => {
  if (props.toolResult?.is_error) return false;

  // Session load
  if (props.toolUseResult?.output) {
    return true;
  }

  // Live conversation
  if (props.toolResult?.content) {
    return true;
  }

  return false;
});

const formattedOutput = computed(() => {
  // Session load
  if (props.toolUseResult?.output) {
    return typeof props.toolUseResult.output === 'string'
      ? props.toolUseResult.output
      : JSON.stringify(props.toolUseResult.output, null, 2);
  }

  // Live conversation - parse content
  if (props.toolResult?.content) {
    const content = props.toolResult.content;

    if (Array.isArray(content)) {
      // content is an array; extract the text
      const textContent = content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n');

      // Try to format as JSON
      try {
        const parsed = JSON.parse(textContent);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return textContent;
      }
    }

    // If it is a string, try to format it
    if (typeof content === 'string') {
      try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return content;
      }
    }

    // Otherwise stringify as JSON
    return JSON.stringify(content, null, 2);
  }

  return '';
});

// Error info
const errorMessage = computed(() => {
  if (!props.toolResult?.is_error) return '';

  const content = props.toolResult.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n');
  }

  return JSON.stringify(content, null, 2);
});

// Whether to auto-expand
const shouldExpand = computed(() => {
  // Expand when there is an error
  if (props.toolResult?.is_error) return true;

  // Expand when there is output
  if (hasOutput.value) return true;

  return false;
});
</script>

<style scoped>
.mcp-label {
  font-weight: 600;
  font-size: 0.85em;
  color: var(--vscode-foreground);
}

.server-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  background-color: color-mix(in srgb, var(--vscode-charts-purple) 20%, transparent);
  color: var(--vscode-charts-purple);
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 600;
  font-family: var(--vscode-editor-font-family);
}

.tool-name {
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  color: color-mix(in srgb, var(--vscode-foreground) 85%, transparent);
}

.mcp-section {
  margin-bottom: 12px;
}

.mcp-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 0.85em;
  font-weight: 600;
  color: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
}

.section-header .codicon {
  font-size: 14px;
}

.json-content {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 8px;
  margin: 0;
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-editor-foreground);
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  font-size: 0.85em;
  line-height: 1.5;
}

.error-section {
  margin-top: 8px;
}

.error-content {
  background-color: color-mix(in srgb, var(--vscode-errorForeground) 10%, transparent);
  border: 1px solid var(--vscode-errorForeground);
  border-radius: 4px;
  padding: 8px;
  margin: 0;
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-errorForeground);
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
  font-size: 0.85em;
  line-height: 1.5;
}
</style>
