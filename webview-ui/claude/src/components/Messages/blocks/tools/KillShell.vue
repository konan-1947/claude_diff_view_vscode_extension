<template>
  <ToolMessageWrapper
    tool-icon="codicon-stop-circle"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="tool-label">KillShell</span>
      <span v-if="shellId" class="shell-id">Shell {{ shellId }}</span>
      <span v-if="isSuccess" class="status-badge success">
        <span class="codicon codicon-check"></span>
        killed
      </span>
    </template>

    <template #expandable>
      <!-- Success message -->
      <div v-if="message && !toolResult?.is_error" class="success-message">
        <span class="codicon codicon-info"></span>
        <span class="message-text">{{ message }}</span>
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

const shellId = computed(() => {
  return props.toolUse?.input?.shell_id || props.toolUseResult?.shell_id || '';
});

const message = computed(() => {
  // Prefer toolUseResult (from session load)
  if (props.toolUseResult?.message) {
    return props.toolUseResult.message;
  }

  // Live conversation: parse from toolResult.content
  if (typeof props.toolResult?.content === 'string') {
    try {
      const data = JSON.parse(props.toolResult.content);
      return data.message || '';
    } catch {
      return props.toolResult.content;
    }
  }

  return '';
});

const isSuccess = computed(() => {
  return !!message.value && !props.toolResult?.is_error;
});

// Expanded by default when there is an error
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

.shell-id {
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

.status-badge.success {
  background-color: color-mix(in srgb, var(--vscode-charts-green) 20%, transparent);
  color: var(--vscode-charts-green);
}

.status-badge .codicon {
  font-size: 10px;
}

.success-message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background-color: color-mix(in srgb, var(--vscode-charts-green) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--vscode-charts-green) 30%, transparent);
  border-radius: 4px;
  color: var(--vscode-foreground);
  font-size: 0.85em;
}

.success-message .codicon {
  font-size: 14px;
  color: var(--vscode-charts-green);
  margin-top: 1px;
  flex-shrink: 0;
}

.message-text {
  flex: 1;
  line-height: 1.4;
  font-family: var(--vscode-editor-font-family);
}
</style>
