<template>
  <ToolMessageWrapper
    tool-icon="codicon-terminal"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="tool-label">{{ description || command }}</span>
      <span v-if="commandName && description" class="tool-description">{{ commandName }}</span>
      <span v-if="runInBackground" class="bg-badge">background</span>
    </template>

    <template v-if="previewLine && !toolResult?.is_error" #preview>
      <div class="output-preview">{{ previewLine }}</div>
    </template>

    <template #expandable>
      <!-- Command content -->
      <div class="bash-command">
        <pre class="command-content">{{ command }}</pre>
      </div>

      <!-- Output content (if any) -->
      <div v-if="hasOutput" class="bash-output">
        <div class="output-header">Output</div>
        <pre class="output-content">{{ outputContent }}</pre>
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

const command = computed(() => {
  return props.toolUse?.input?.command || '';
});

const description = computed(() => {
  return props.toolUse?.input?.description || '';
});

const commandName = computed(() => command.value.trim().split(/\s+/)[0] || '');

const runInBackground = computed(() => {
  return props.toolUse?.input?.run_in_background || false;
});

const outputContent = computed(() => {
  // Get the output from toolResult.content
  if (typeof props.toolResult?.content === 'string') {
    return props.toolResult.content;
  }
  return '';
});

// First non-empty line of output, shown under the header while collapsed
const previewLine = computed(() => {
  const first = outputContent.value.split('\n').find((l: string) => l.trim() !== '');
  return first ? first.trim() : '';
});

const hasOutput = computed(() => {
  return outputContent.value && !props.toolResult?.is_error;
});

// Output never opens the card by itself (the first line is previewed instead)
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

.tool-description {
  color: color-mix(in srgb, var(--vscode-foreground) 70%, transparent);
  font-size: 0.85em;
  font-style: italic;
}

.bg-badge {
  background-color: color-mix(in srgb, var(--vscode-charts-blue) 20%, transparent);
  color: var(--vscode-charts-blue);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 500;
}

.output-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bash-command {
  margin-bottom: 8px;
}

.command-content {
  background-color: color-mix(
    in srgb,
    var(--vscode-terminal-background, var(--vscode-editor-background)) 80%,
    transparent
  );
  border: 1px solid var(--vscode-terminal-border, var(--vscode-panel-border));
  border-radius: 4px;
  padding: 8px 12px;
  color: var(--vscode-terminal-foreground, var(--vscode-editor-foreground));
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
}

.bash-output {
  margin-top: 8px;
}

.output-header {
  color: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
  font-size: 0.85em;
  margin-bottom: 4px;
  font-weight: 500;
}

.output-content {
  background-color: color-mix(
    in srgb,
    var(--vscode-terminal-background, var(--vscode-editor-background)) 90%,
    transparent
  );
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
</style>
