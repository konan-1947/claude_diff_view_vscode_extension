<template>
  <ToolMessageWrapper
    tool-icon="codicon-terminal-two"
    tool-name="BashOutput"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="tool-label">BashOutput</span>
      <span v-if="bashId" class="bash-id">Shell {{ bashId }}</span>
      <span v-if="status === 'running'" class="status-badge running">
        <span class="codicon codicon-loading codicon-modifier-spin"></span>
        running
      </span>
      <span v-else-if="exitCode !== null && exitCode !== undefined" class="status-badge" :class="exitCode === 0 ? 'success' : 'error'">
        exit {{ exitCode }}
      </span>
      <span v-if="hasFilter" class="filter-badge">
        <span class="codicon codicon-filter"></span>
        filtered
      </span>
    </template>

    <template #expandable>
      <!-- Output content -->
      <div v-if="hasOutput" class="bash-output">
        <pre class="output-content">{{ outputContent }}</pre>
      </div>

      <!-- No-output hint -->
      <div v-else-if="!toolResult?.is_error" class="no-output">
        <span class="codicon codicon-info"></span>
        No new output
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

const bashId = computed(() => {
  return props.toolUse?.input?.bash_id || props.toolUseResult?.shellId || '';
});

const filter = computed(() => {
  return props.toolUse?.input?.filter || '';
});

const hasFilter = computed(() => {
  return !!filter.value;
});

const status = computed(() => {
  return props.toolUseResult?.status || '';
});

const command = computed(() => {
  return props.toolUseResult?.command || '';
});

const exitCode = computed(() => {
  return props.toolUseResult?.exitCode;
});

const outputContent = computed(() => {
  // Prefer toolUseResult (from session load)
  if (props.toolUseResult) {
    const stdout = props.toolUseResult.stdout || '';
    const stderr = props.toolUseResult.stderr || '';

    if (stdout && stderr) {
      return `${stdout}\n\n[stderr]\n${stderr}`;
    }
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return `[stderr]\n${stderr}`;
    }
  }

  // Live conversation: get it from toolResult.content
  if (typeof props.toolResult?.content === 'string') {
    // Parse the XML-formatted output
    const content = props.toolResult.content;

    // Extract stdout
    const stdoutMatch = content.match(/<stdout>([\s\S]*?)<\/stdout>/);
    const stderrMatch = content.match(/<stderr>([\s\S]*?)<\/stderr>/);

    const stdout = stdoutMatch ? stdoutMatch[1].trim() : '';
    const stderr = stderrMatch ? stderrMatch[1].trim() : '';

    if (stdout && stderr) {
      return `${stdout}\n\n[stderr]\n${stderr}`;
    }
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return `[stderr]\n${stderr}`;
    }

    // If nothing matched, return the raw content
    return content;
  }

  return '';
});

const hasOutput = computed(() => {
  return !!outputContent.value && !props.toolResult?.is_error;
});

// Output never opens the card by itself
const shouldExpand = computed(() => {
  return !!props.toolResult?.is_error;
});
</script>

<style scoped>
.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.bash-id {
  color: color-mix(in srgb, var(--vscode-foreground) 70%, transparent);
  font-size: 0.85em;
  font-family: var(--vscode-editor-font-family);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 500;
}

.status-badge.running {
  background-color: color-mix(in srgb, var(--vscode-charts-blue) 20%, transparent);
  color: var(--vscode-charts-blue);
}

.status-badge.success {
  background-color: color-mix(in srgb, var(--vscode-charts-green) 20%, transparent);
  color: var(--vscode-charts-green);
}

.status-badge.error {
  background-color: color-mix(in srgb, var(--vscode-charts-red) 20%, transparent);
  color: var(--vscode-charts-red);
}

.status-badge .codicon {
  font-size: 10px;
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background-color: color-mix(in srgb, var(--vscode-charts-orange) 20%, transparent);
  color: var(--vscode-charts-orange);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 500;
}

.filter-badge .codicon {
  font-size: 10px;
}

.bash-output {
  margin-top: 4px;
}

.output-content {
  background-color: color-mix(in srgb, var(--vscode-terminal-background, var(--vscode-editor-background)) 90%, transparent);
  border: 1px solid var(--vscode-terminal-border, var(--vscode-panel-border));
  border-radius: 4px;
  padding: 8px 12px;
  color: var(--vscode-terminal-foreground, var(--vscode-editor-foreground));
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  max-height: 400px;
  overflow-y: auto;
}

.no-output {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  color: color-mix(in srgb, var(--vscode-foreground) 60%, transparent);
  font-size: 0.85em;
  font-style: italic;
}

.no-output .codicon {
  font-size: 14px;
  opacity: 0.7;
}
</style>
