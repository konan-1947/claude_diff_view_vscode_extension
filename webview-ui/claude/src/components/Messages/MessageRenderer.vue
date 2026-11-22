<template>
  <component
    class="message"
    v-if="!message.isEmpty"
    :is="messageComponent"
    :message="message"
    :context="context"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Message } from '../../models/Message';
import type { ToolContext } from '../../types/tool';
import UserMessage from './UserMessage.vue';
import AssistantMessage from './AssistantMessage.vue';
import SystemMessage from './SystemMessage.vue';
import TipMessage from './TipMessage.vue';
import SlashCommandResultMessage from './SlashCommandResultMessage.vue';
import BashMessage from './BashMessage.vue';

interface Props {
  message: Message;
  context: ToolContext;
}

const props = defineProps<Props>();

// Pick the render component based on the message type
const messageComponent = computed(() => {
  switch (props.message.type) {
    case 'user':
      return UserMessage;
    case 'assistant':
      return AssistantMessage;
    case 'tip':
      return TipMessage;
    case 'slash_command_result':
      return SlashCommandResultMessage;
    case 'bash':
      return BashMessage;
    case 'system':
      return SystemMessage;
    default:
      return null;
  }
});
</script>

<style scoped>
  .message {
    margin-bottom: 4px;
  }
</style>
