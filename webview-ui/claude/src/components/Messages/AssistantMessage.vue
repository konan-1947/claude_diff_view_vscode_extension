<template>
  <div class="assistant-message" :class="messageClasses">
    <template v-if="typeof message.message.content === 'string'">
      <ContentBlock :block="{ type: 'text', text: message.message.content }" :context="context" />
    </template>
    <template v-else>
      <ContentBlock
        v-for="(wrapper, index) in message.message.content"
        :key="index"
        :block="wrapper.content"
        :wrapper="wrapper"
        :context="context"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Message } from '../../models/Message';
import type { ToolContext } from '../../types/tool';
import ContentBlock from './ContentBlock.vue';

interface Props {
  message: Message;
  context: ToolContext;
}

const props = defineProps<Props>();

// Compute the dynamic class
const messageClasses = computed(() => {
  const content = props.message.message.content;

  // content is always an array; check whether it contains tool_use
  if (Array.isArray(content)) {
    const hasToolUse = content.some(wrapper => wrapper.content.type === 'tool_use');
    // Only plain-text messages (no tool_use) show the dot
    return hasToolUse ? [] : ['prefix'];
  }

  return [];
});
</script>

<style scoped>
.assistant-message {
  display: block;
  outline: none;
  padding: 0px 16px 0.4rem;
  background-color: var(--vscode-sideBar-background);
  opacity: 1;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vscode-editor-foreground);
  word-wrap: break-word;
  padding-left: 24px;
}

/* Show the dot only for plain-text messages */
.assistant-message.prefix::before {
  content: "\25cf";
  position: absolute;
  left: 8px;
  padding-top: 2px;
  font-size: 10px;
  color: var(--vscode-input-border);
  z-index: 1;
}
</style>
