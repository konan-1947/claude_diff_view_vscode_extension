<template>
  <ToolMessageWrapper
    tool-icon="codicon-code"
    tool-name="eval"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="tool-label">{{ title || 'Run code' }}</span>
      <span v-if="!title && firstCodeLine" class="tool-description">{{ firstCodeLine }}</span>
      <span v-if="languageName" class="badge">{{ languageName }}</span>
      <span v-if="input.reset" class="badge badge-reset">reset</span>
    </template>

    <template v-if="previewLine && !isError" #preview>
      <div class="output-preview">{{ previewLine }}</div>
    </template>

    <template #expandable>
      <pre class="code-block">{{ code }}</pre>

      <template v-if="!isError">
        <template v-for="(cell, index) in cellsWithOutput" :key="index">
          <div class="section-header">
            <span>Output</span>
            <span v-if="cell.title" class="cell-title">{{ cell.title }}</span>
            <span v-if="cell.durationMs" class="duration">
              {{ formatDuration(Number(cell.durationMs)) }}
            </span>
          </div>
          <pre class="output-block" :class="{ 'is-error': cellError(cell) }">{{ cellOutput(cell) }}</pre>
        </template>

        <template v-if="!cellsWithOutput.length && resultText">
          <div class="section-header">Output</div>
          <pre class="output-block">{{ resultText }}</pre>
        </template>
      </template>

      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ToolMessageWrapper from '../common/ToolMessageWrapper.vue';
import ToolError from '../common/ToolError.vue';
import { firstLine, toolResultText } from '../common/codeModeResult';
import { asText, formatDuration } from './ompDiff';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

const props = defineProps<Props>();

const input = computed<any>(() => props.toolUse?.input ?? {});
const details = computed<any>(() => props.toolUseResult ?? {});
const isError = computed<boolean>(() => !!props.toolResult?.is_error);
const resultText = computed<string>(() => toolResultText(props.toolResult));

const code = computed<string>(() => asText(input.value.code));
const title = computed<string>(() => asText(input.value.title));
const firstCodeLine = computed<string>(() => firstLine(code.value));

const languageName = computed<string>(() =>
  languageLabel(asText(details.value?.language) || asText(input.value?.language))
);

const cells = computed<any[]>(() =>
  Array.isArray(details.value?.cells) ? details.value.cells : []
);

const cellsWithOutput = computed<any[]>(() =>
  cells.value.filter((cell: any) => cellOutput(cell).trim() !== '')
);

const previewLine = computed<string>(() => {
  if (isError.value) return '';
  const first = cellsWithOutput.value[0];
  return firstLine(first ? cellOutput(first) : resultText.value);
});

const shouldExpand = computed<boolean>(() => isError.value);

function cellOutput(cell: any): string {
  return asText(cell?.output);
}

function cellError(cell: any): boolean {
  if (typeof cell?.exitCode === 'number' && cell.exitCode !== 0) return true;
  if (typeof cell?.status === 'string') return cell.status !== 'complete';
  return false;
}

function languageLabel(value: string): string {
  const language = value.toLowerCase();
  if (language === 'py' || language === 'python') return 'Python';
  if (language === 'js' || language === 'javascript') return 'JavaScript';
  return language ? language.charAt(0).toUpperCase() + language.slice(1) : '';
}
</script>

<style scoped>
.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.tool-description {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: color-mix(in srgb, var(--vscode-foreground) 70%, transparent);
  font-size: 0.85em;
  font-style: italic;
}

.badge {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 500;
  background-color: color-mix(in srgb, var(--vscode-charts-blue) 20%, transparent);
  color: var(--vscode-charts-blue);
}

.badge-reset {
  background-color: color-mix(in srgb, var(--vscode-foreground) 14%, transparent);
  color: color-mix(in srgb, var(--vscode-foreground) 75%, transparent);
}

.output-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
  font-size: 0.85em;
  margin: 8px 0 4px;
  font-weight: 500;
}

.cell-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: color-mix(in srgb, var(--vscode-foreground) 60%, transparent);
  font-weight: 400;
}

.duration {
  margin-left: auto;
  color: color-mix(in srgb, var(--vscode-foreground) 50%, transparent);
  font-weight: 400;
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
</style>
