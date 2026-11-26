<template>
  <div v-if="visible && total > 0" class="message-queue-section">
    <!-- Message Queue header -->
    <div
      style="display: flex; justify-content: space-between; align-items: center; height: 24px; cursor: pointer;"
      @click="toggleExpanded"
    >
      <div style="display: flex; align-items: center; gap: 4px; flex-grow: 1; padding-left: 4px;">
        <span
          class="codicon"
          :class="expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'"
          style="color: var(--vscode-foreground); opacity: 0.6; font-size: 12px;"
        />
        <div style="font-size: 12px; color: var(--vscode-input-placeholderForeground); opacity: 0.8;">
          <span>{{ total }} Queued</span>
        </div>
      </div>
      <span class="queue-hint"><template v-if="queuedMessages.length > 0">Ctrl+U send now&nbsp;&nbsp;</template>↑ to edit</span>
    </div>

    <!-- Queue list (when expanded) -->
    <div
      v-if="expanded"
      class="queue-item-list"
      style="padding: 4px 0;"
    >
      <!-- Already with the CLI: it takes them in after the current step, then
           they move into the conversation (as the CLI shows its queue) -->
      <div
        v-for="message in sentMessages"
        :key="message.id"
        class="queue-item sent"
        :title="`Sent: ${agentName} reads it after the current step`"
      >
        <div class="queue-item-indicator sent-indicator"></div>
        <div style="display: flex; flex-direction: column;">
          <div style="max-height: 56px; mask-image: none;">
            <div class="aislash-editor-input-readonly" contenteditable="false">
              <p><span>{{ message.content }}</span></p>
            </div>
          </div>
        </div>
      </div>
      <div
        v-for="message in queuedMessages"
        :key="message.id"
        class="queue-item"
      >
        <!-- Queue indicator -->
        <div
          class="queue-item-indicator"
          style="opacity: 0.4; border: 1px solid var(--vscode-foreground);"
        ></div>

        <!-- Message content -->
        <div style="display: flex; flex-direction: column;">
          <div style="max-height: 56px; mask-image: none;">
            <div
              class="aislash-editor-input-readonly"
              contenteditable="false"
              :title="message.content"
            >
              <p><span>{{ message.content }}</span></p>
            </div>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="queue-item-actions">
          <!-- Delete button -->
          <Tooltip content="Remove from queue">
            <div
              class="anysphere-icon-button"
              @click="$emit('remove', message.id)"
            >
              <span class="codicon codicon-trashcan text-[12px]!"></span>
            </div>
          </Tooltip>
          <!-- Send now button -->
          <Tooltip content="Send immediately (Ctrl+U sends all)">
            <div
              class="anysphere-icon-button"
              @click="$emit('sendNow', message.id)"
            >
              <span class="codicon codicon-arrow-up-two text-[12px]!"></span>
            </div>
          </Tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import Tooltip from './Common/Tooltip.vue'
import type { QueuedMessage } from '../types/queue'
import { agentName } from '../utils/backend'

interface Props {
  queuedMessages?: QueuedMessage[]
  /** Sent mid-turn, waiting in the CLI's queue (no actions: they are no longer ours to edit) */
  sentMessages?: { id: string; content: string }[]
  visible?: boolean
  initialExpanded?: boolean
}

interface Emits {
  (e: 'remove', messageId: string): void
  (e: 'sendNow', messageId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  queuedMessages: () => [],
  sentMessages: () => [],
  visible: false,
  initialExpanded: true
})

defineEmits<Emits>()

const expanded = ref(props.initialExpanded)
const total = computed(() => props.sentMessages.length + props.queuedMessages.length)

function toggleExpanded() {
  expanded.value = !expanded.value
}
</script>

<style scoped>
.queue-hint {
  flex-shrink: 0;
  padding-right: 8px;
  font-size: 11px;
  color: var(--vscode-input-placeholderForeground);
  opacity: 0.7;
}


.queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  box-sizing: border-box;
  padding: 4px 8px 4px 6px;
  border-radius: 4px;
  transition: background-color 0.1s ease;
  cursor: pointer;
}

.queue-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.queue-item-indicator {
  border-radius: 50%;
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  transition: opacity 0.1s;
  color: var(--vscode-foreground);
}

.queue-item.sent {
  cursor: default;
}

.sent-indicator {
  opacity: 0.4;
  background: var(--vscode-foreground);
}

.aislash-editor-input-readonly {
  resize: none;
  grid-area: 1 / 1 / 1 / 1;
  overflow: hidden;
  line-height: 1.5;
  font-family: inherit;
  font-size: 13px;
  color: var(--vscode-input-foreground);
  background-color: transparent;
  display: block;
  outline: none;
  scrollbar-width: none;
  box-sizing: border-box;
  border: none;
  overflow-wrap: break-word;
  word-break: break-word;
  padding: 0px;
  user-select: text;
  white-space: pre-wrap;
}

.aislash-editor-input-readonly p {
  margin: 0;
}

.queue-item-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.anysphere-icon-button {
  background: transparent;
  border: none;
  color: var(--vscode-foreground, var(--vscode-foreground));
  display: flex;
  width: 12px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 2px;
  transition: background-color 0.2s;
  opacity: 0.6;
}

.anysphere-icon-button:hover {
  background: var(--vscode-toolbar-hoverBackground);
  opacity: 1;
}

.anysphere-icon-button span {
  font-size: 12px !important;
}
</style>