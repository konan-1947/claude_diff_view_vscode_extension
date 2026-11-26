<template>
  <div v-if="visible" class="todo-list-section">
    <Collapsible :default-open="initialExpanded">
      <template #trigger="{ open }">
        <!-- Todo header -->
        <div style="display: flex; align-items: center; height: 24px; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 4px; flex-grow: 1; padding-left: 4px;">
            <span
              class="codicon"
              :class="open ? 'codicon-chevron-down' : 'codicon-chevron-right'"
              style="color: var(--vscode-foreground); opacity: 0.6; font-size: 12px; transition: transform 0.1s;"
            />
            <div style="font-size: 12px; color: var(--vscode-input-placeholderForeground); opacity: 0.8;">
              {{ todos.length }} To-dos
            </div>
          </div>
        </div>
      </template>

      <!-- Todo list -->
      <div
        v-if="todos.length > 0"
        style="height: 190px; overflow: hidden; padding-bottom: 3px;"
      >
        <div class="custom-scrollbar" style="height: 100%; overflow-y: auto;">
          <ul class="todo-list fade-in-fast" style="margin: 0; padding: 0; list-style: none;">
            <li
              v-for="(todo, index) in todos"
              :key="index"
              class="todo-item fade-in-todo"
              :class="todo.status"
              @click="toggleTodo(index)"
            >
              <div class="todo-item-icon-container">
                <div
                  v-if="todo.status === 'in_progress'"
                  class="todo-in-progress-circle"
                >
                  <span class="codicon codicon-arrow-small-right" />
                </div>
                <div
                  v-else
                  class="todo-item-indicator"
                  :class="{ 'has-icon': todo.status === 'completed' }"
                >
                  <div
                    v-if="todo.status === 'completed'"
                    class="codicon codicon-check-two"
                    style="font-size: 6px; margin-left: -1px"
                  />
                </div>
              </div>
              <div class="todo-item-content">
                <span
                  class="todo-item-text"
                  :class="{ 'todo-in-progress': todo.status === 'in_progress' }"
                >
                  {{ todo.content }}
                </span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </Collapsible>
  </div>
</template>

<script setup lang="ts">
import Collapsible from './Common/Collapsible.vue'
import type { Todo } from '../types/toolbar'

interface Props {
  todos?: Todo[]
  visible?: boolean
  initialExpanded?: boolean
}

interface Emits {
  (e: 'todoToggle', index: number): void
}

withDefaults(defineProps<Props>(), {
  todos: () => [],
  visible: false,
  initialExpanded: true
})

const emit = defineEmits<Emits>()

function toggleTodo(index: number) {
  emit('todoToggle', index)
}
</script>

<style scoped>
/* Custom scrollbar style - hidden by default, shown on hover */
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: transparent;
  transition: background-color 0.2s ease;
}

.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background);
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--vscode-scrollbarSlider-hoverBackground);
}

.custom-scrollbar::-webkit-scrollbar-corner {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-button {
  display: none;
}
</style>
