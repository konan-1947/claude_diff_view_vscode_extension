<template>
  <ToolMessageWrapper
    tool-icon="codicon-code"
    tool-name="REPL"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="tool-label">{{ description || 'Run script' }}</span>
      <span v-if="!description && firstCodeLine" class="tool-description">{{ firstCodeLine }}</span>
      <span v-if="dispatched" class="badge">dispatched #{{ dispatched }}</span>
    </template>

    <template v-if="previewLine && !toolResult?.is_error" #preview>
      <div class="output-preview">{{ previewLine }}</div>
    </template>

    <template #expandable>
      <pre class="code-block">{{ code }}</pre>

      <template v-if="!toolResult?.is_error">
        <template v-for="(section, i) in sections" :key="i">
          <div class="section-header">{{ sectionTitle(section.kind) }}</div>
          <pre
            class="output-block"
            :class="{ 'is-error': section.kind === 'error', 'is-log': section.kind === 'log' }"
          >{{ section.text }}</pre>
        </template>
        <div v-if="dispatched" class="section-header muted">
          Running; its output arrives in a later Poll.
        </div>
      </template>

      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';
import { dispatchedId, firstLine, parseSections, toolResultText, type ResultSection } from './common/codeModeResult';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

const props = defineProps<Props>();

const code = computed<string>(() => props.toolUse?.input?.code || '');
const description = computed<string>(() => props.toolUse?.input?.description || '');
const firstCodeLine = computed(() => firstLine(code.value));

const resultText = computed(() => toolResultText(props.toolResult));
const dispatched = computed(() => dispatchedId(resultText.value));

const sections = computed<ResultSection[]>(() => {
  if (dispatched.value || !resultText.value) return [];
  return parseSections(resultText.value);
});

const previewLine = computed(() => {
  if (dispatched.value) return '';
  const main = sections.value.find((s) => s.kind === 'result' || s.kind === 'error' || s.kind === 'text');
  return firstLine(main?.text ?? '');
});

function sectionTitle(kind: ResultSection['kind']): string {
  switch (kind) {
    case 'log': return 'Log';
    case 'error': return 'Error';
    default: return 'Output';
  }
}

// Output never opens the card by itself (the first line is previewed instead)
const shouldExpand = computed(() => !!props.toolResult?.is_error);
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

.badge {
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

.section-header {
  color: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
  font-size: 0.85em;
  margin: 8px 0 4px;
  font-weight: 500;
}

.code-block,
.output-block {
  background-color: color-mix(
    in srgb,
    var(--vscode-terminal-background, var(--vscode-editor-background)) 85%,
    transparent
  );
  border: 1px solid var(--vscode-terminal-border, var(--vscode-panel-border));
  border-radius: 4px;
  padding: 8px 12px;
  color: var(--vscode-terminal-foreground, var(--vscode-editor-foreground));
  font-family: var(--vscode-editor-font-family);
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.code-block {
  font-size: 0.9em;
  max-height: 400px;
  overflow-y: auto;
}

.output-block {
  font-size: 0.85em;
  max-height: 400px;
  overflow-y: auto;
}

.output-block.is-error {
  border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
  color: var(--vscode-errorForeground);
}

.output-block.is-log {
  opacity: 0.85;
}

.muted {
  color: color-mix(in srgb, var(--vscode-foreground) 60%, transparent);
  font-style: italic;
  font-size: 0.85em;
}
</style>
