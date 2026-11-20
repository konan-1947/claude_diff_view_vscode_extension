<template>
  <ToolMessageWrapper
    tool-icon="codicon-symbol-event"
    :tool-result="toolResult"
  >
    <template #main>
      <span class="command-text">{{ command }}</span>
    </template>

    <template #expandable>
      <ToolError v-if="toolResult?.is_error" :tool-result="toolResult" />
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

// Command content
const command = computed(() => {
  // toolUseResult may be a string or an object; prefer toolUse.input
  if (props.toolUse?.input?.command) {
    return props.toolUse.input.command;
  }
  // Only read the command property when toolUseResult is an object
  if (props.toolUseResult && typeof props.toolUseResult === 'object' && props.toolUseResult.command) {
    return props.toolUseResult.command;
  }
  return '';
});
</script>

<style scoped>
.command-text {
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
  color: var(--vscode-foreground);
  font-weight: 500;
}
</style>
