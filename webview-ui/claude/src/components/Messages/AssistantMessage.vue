<template>
  <div class="assistant-message">
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
import type { Message } from '../../models/Message';
import type { ToolContext } from '../../types/tool';
import ContentBlock from './ContentBlock.vue';

interface Props {
  message: Message;
  context: ToolContext;
}

defineProps<Props>();
</script>

<style scoped>
/* Plain, frameless assistant reply: text gets its own gutter (TextBlock),
   tool cards bring their own margin (ToolMessageWrapper). */
.assistant-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
  outline: none;
  padding: 4px 0 6px;
  background-color: var(--vscode-sideBar-background);
  font-size: 14px;
  line-height: 22px;
  color: var(--vscode-editor-foreground);
  word-wrap: break-word;
}
</style>
