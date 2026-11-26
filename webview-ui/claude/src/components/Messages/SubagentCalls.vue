<template>
  <div v-if="calls.length > 0" class="child-calls">
    <div v-for="call in calls" :key="call.id" class="child-call" :title="call.detail">
      <OmpSpinner v-if="isOmp && call.icon.includes('codicon-loading')" class="child-state" />
      <span v-else class="codicon child-state" :class="call.icon"></span>
      <span class="child-name">{{ call.name }}</span>
      <span v-if="call.detail" class="child-detail" :class="{ code: call.isCode }">{{ call.detail }}</span>
    </div>
  </div>
  <div v-else-if="emptyText" class="child-empty">{{ emptyText }}</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { subagentCalls } from '../../utils/subagentCalls';
import OmpSpinner from '../OmpSpinner.vue';
import { isOmp } from '../../utils/backend';

/** A subagent's own tool calls, one row each (Agent card, background task list) */
const props = defineProps<{ messages: any[]; emptyText?: string }>();

const calls = computed(() => subagentCalls(props.messages));
</script>

<style scoped>
.child-calls {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.child-call {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  line-height: 18px;
}

.child-state {
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0.7;
}

.child-state.codicon-error {
  color: var(--vscode-errorForeground);
  opacity: 1;
}

.child-name {
  flex-shrink: 0;
  font-weight: 500;
  color: var(--vscode-foreground);
}

.child-detail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
}

.child-detail.code {
  font-family: var(--vscode-editor-font-family, monospace);
}

.child-empty {
  font-size: 12px;
  opacity: 0.6;
}
</style>
