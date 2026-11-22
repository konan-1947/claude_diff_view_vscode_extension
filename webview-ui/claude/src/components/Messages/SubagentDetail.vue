<template>
  <div class="subagent-detail">
    <SubagentStatusLine v-if="status && showStatus" :status="status" :failed="failed" class="in-body" />

    <div v-if="prompt" class="detail-section">
      <div class="section-header">
        <span class="codicon codicon-comment-discussion"></span>
        <span>Prompt</span>
      </div>
      <pre class="detail-content">{{ prompt }}</pre>
    </div>

    <div class="detail-section">
      <div class="section-header">
        <span class="codicon codicon-list-tree"></span>
        <span>Tool calls</span>
      </div>
      <SubagentCalls :messages="messages" :empty-text="running ? 'No tool calls yet' : 'No tool calls'" />
    </div>

    <div v-if="result && !running" class="detail-section">
      <div class="section-header">
        <span class="codicon codicon-note"></span>
        <span>Result</span>
      </div>
      <pre class="detail-content">{{ result }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SubagentCalls from './SubagentCalls.vue';
import SubagentStatusLine from './SubagentStatusLine.vue';
import type { TaskInfo } from '../../core/LiveActivity';
import type { SubagentStatus } from '../../utils/subagentCalls';
import { subagentReport } from '../../utils/subagentCalls';

/**
 * What a subagent did: status line, prompt, its tool calls and its result.
 * Same body in the Agent card and in the background task list.
 */
const props = withDefaults(defineProps<{
  task?: TaskInfo;
  messages: any[];
  prompt?: string;
  status: SubagentStatus | null;
  running: boolean;
  failed?: boolean;
  showStatus?: boolean;
}>(), {
  task: undefined,
  prompt: undefined,
  failed: false,
  showStatus: true,
});

// The handed-back report when there is one; the task summary otherwise
const result = computed(() => subagentReport(props.messages) ?? props.task?.summary);
</script>

<style scoped>
.subagent-detail {
  font-family: var(--vscode-font-family);
}

.in-body {
  margin-bottom: 8px;
}

.detail-section {
  margin-bottom: 12px;
}

.detail-section:last-child {
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

.detail-content {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 8px;
  margin: 0;
  font-family: var(--vscode-font-family);
  color: var(--vscode-editor-foreground);
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  font-size: 0.85em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
