<template>
  <div class="status-line" :class="{ failed }">
    <span v-if="status.what" class="status-what">{{ status.what }}<template v-if="status.detail">(<span :class="{ code: status.isCode }">{{ status.detail }}</span>)</template></span>
    <span v-if="status.stats" class="status-stats">{{ status.stats }}</span>
  </div>
</template>

<script setup lang="ts">
import type { SubagentStatus } from '../../utils/subagentCalls';

/** `Bash(sleep 3)   2 tool uses   17.3k tokens   8s`, the CLI's subagent line */
defineProps<{ status: SubagentStatus; failed?: boolean }>();
</script>

<style scoped>
.status-line {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
  font-size: 12px;
  line-height: 18px;
}

.status-line.failed .status-what {
  color: var(--vscode-errorForeground);
}

.status-what {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vscode-foreground);
  opacity: 0.85;
}

.status-what .code {
  font-family: var(--vscode-editor-font-family, monospace);
}

.status-stats {
  flex-shrink: 0;
  white-space: nowrap;
  opacity: 0.6;
}
</style>
