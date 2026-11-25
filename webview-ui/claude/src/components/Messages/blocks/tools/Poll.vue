<template>
  <ToolMessageWrapper
    tool-icon="codicon-bell"
    tool-name="Poll"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="tool-label">Poll</span>
      <span v-if="summary" class="tool-description">{{ summary }}</span>
    </template>

    <template v-if="previewLine && !toolResult?.is_error" #preview>
      <div class="output-preview">{{ previewLine }}</div>
    </template>

    <template #expandable>
      <template v-if="!toolResult?.is_error">
        <div v-if="events" class="events">
          <div v-for="(event, i) in events" :key="i" class="event">
            <div class="section-header">
              {{ event.kind }}<template v-if="event.evalId"> #{{ event.evalId }}</template>
              <span v-if="event.status" class="badge">{{ event.status }}</span>
            </div>
            <pre
              v-for="(section, j) in event.sections"
              :key="j"
              class="output-block"
              :class="{ 'is-error': section.kind === 'error', 'is-log': section.kind === 'log' }"
            >{{ section.text }}</pre>
          </div>
        </div>
        <div v-else-if="isEmpty" class="muted">No pending events</div>
        <pre v-else-if="resultText" class="output-block">{{ resultText }}</pre>
      </template>

      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';
import { firstLine, parsePollEvents, toolResultText } from './common/codeModeResult';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

const props = defineProps<Props>();

const resultText = computed(() => toolResultText(props.toolResult));
const events = computed(() => (resultText.value ? parsePollEvents(resultText.value) : undefined));
const isEmpty = computed(() => /\(no pending events\)/.test(resultText.value) && !events.value);

const summary = computed(() => {
  if (events.value) {
    const n = events.value.length;
    return n === 1 ? '1 event' : `${n} events`;
  }
  if (isEmpty.value) return 'no pending events';
  return '';
});

const previewLine = computed(() => {
  const first = events.value?.find((e) => e.sections.length > 0);
  return first ? firstLine(first.sections[first.sections.length - 1].text) : '';
});

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

.event + .event {
  margin-top: 4px;
}

.event .output-block + .output-block {
  margin-top: 4px;
}

.section-header .badge {
  margin-left: 6px;
}
</style>
