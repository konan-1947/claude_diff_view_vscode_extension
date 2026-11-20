<template>
  <div class="system-message">
    <div class="system-message-label">System</div>
    <div class="system-message-content">
      {{ content }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Message } from '../../models/Message';
import type { ToolContext } from '../../types/tool';

interface Props {
  message: Message;
  context?: ToolContext; // passed by MessageRenderer; declared so it is not rendered into the DOM
}

const props = defineProps<Props>();

const content = computed(() => {
  if (typeof props.message.message.content === 'string') {
    return props.message.message.content;
  }
  return props.message.subtype === 'init' ? 'Session initialized' : 'System message';
});
</script>

<style scoped>
.system-message {
  padding: 8px 12px;
  background-color: var(--vscode-inputValidation-infoBackground);
  border-left: 3px solid var(--vscode-inputValidation-infoBorder);
  border-radius: 4px;
  font-size: 12px;
}

.system-message-label {
  font-weight: 600;
  color: var(--vscode-inputValidation-infoForeground);
  margin-bottom: 4px;
}

.system-message-content {
  color: var(--vscode-editor-foreground);
  opacity: 0.8;
}
</style>
