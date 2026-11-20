<template>
  <div v-if="shouldShow" style="padding: 0px 9px;">
    <div class="toolbar-section">
      <TodoList
        :todos="todos"
        :visible="showTodos"
        @todo-toggle="$emit('todoToggle', $event)"
      />
      <!-- Divider - between Todo and Queue -->
      <Separator v-if="shouldShowTodoQueueDivider" style="margin: 2px -5px;" />
      <MessageQueueList
        :queued-messages="queuedMessages"
        :visible="showQueue"
        @remove="$emit('queueRemove', $event)"
        @send-now="$emit('queueSendNow', $event)"
      />
      <!-- Divider - between Queue and Files -->
      <Separator v-if="shouldShowQueueFilesDivider" style="margin: 2px -5px;" />
      <FileEditedList
        :files-edited="filesEdited"
        :visible="showFiles"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TodoList from './TodoList.vue'
import FileEditedList from './FileEditedList.vue'
import MessageQueueList from './MessageQueueList.vue'
import Separator from './Common/Separator.vue'
import type { Todo, FileEdit } from '../types/toolbar'
import type { QueuedMessage } from '../types/queue'

interface Props {
  todos?: Todo[]
  filesEdited?: FileEdit[]
  queuedMessages?: QueuedMessage[]
  showTodos?: boolean
  showFiles?: boolean
  showQueue?: boolean
}

interface Emits {
  (e: 'todoToggle', index: number): void
  (e: 'queueRemove', messageId: string): void
  (e: 'queueSendNow', messageId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  todos: () => [],
  filesEdited: () => [],
  queuedMessages: () => [],
  showTodos: false,
  showFiles: false,
  showQueue: false
})

defineEmits<Emits>()

// Display logic: show the whole container only when any item needs to be shown
const shouldShow = computed(() => {
  const hasTodos = props.showTodos && props.todos.length > 0
  const hasFiles = props.showFiles && props.filesEdited.length > 0
  const hasQueue = props.showQueue && props.queuedMessages.length > 0
  return hasTodos || hasFiles || hasQueue
})

// Divider between Todo and Queue
const shouldShowTodoQueueDivider = computed(() => {
  const hasTodos = props.showTodos && props.todos.length > 0
  const hasQueue = props.showQueue && props.queuedMessages.length > 0
  return hasTodos && hasQueue
})

// Divider between Queue and Files
const shouldShowQueueFilesDivider = computed(() => {
  const hasQueue = props.showQueue && props.queuedMessages.length > 0
  const hasFiles = props.showFiles && props.filesEdited.length > 0
  return hasQueue && hasFiles
})
</script>