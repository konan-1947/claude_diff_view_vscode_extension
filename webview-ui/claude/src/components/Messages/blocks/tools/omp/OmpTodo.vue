<template>
  <ToolMessageWrapper
    tool-icon="codicon-checklist"
    tool-name="todo"
    :tool-result="toolResult"
    :default-expanded="true"
  >
    <template #main>
      <span class="tool-label">To-dos</span>
      <span v-if="opSummary" class="op-summary">{{ opSummary }}</span>
      <span v-if="total > 0" class="todo-count">{{ completedCount }}/{{ total }} done</span>
    </template>

    <template #expandable>
      <div v-if="phases.length" class="todo-phases">
        <div v-for="(phase, phaseIndex) in phases" :key="phaseIndex" class="todo-phase">
          <div class="phase-header">
            <span class="phase-name">{{ phase.name || 'Tasks' }}</span>
            <span class="phase-count">{{ phaseDone(phase) }}/{{ phase.tasks.length }}</span>
          </div>
          <ul class="todo-list">
            <li
              v-for="(task, taskIndex) in phase.tasks"
              :key="taskIndex"
              class="todo-item"
              :class="{ 'is-changed': highlight.has(task.content) }"
            >
              <div class="todo-label">
                <div class="todo-item-icon-container">
                  <div v-if="task.status === 'in_progress'" class="todo-in-progress-circle">
                    <span class="codicon codicon-arrow-small-right" />
                  </div>
                  <div v-else-if="task.status === 'blocked'" class="todo-item-indicator is-blocked">
                    <span class="codicon codicon-circle-slash" />
                  </div>
                  <div
                    v-else
                    class="todo-item-indicator"
                    :class="{ 'has-icon': task.status === 'completed' }"
                  >
                    <div
                      v-if="task.status === 'completed'"
                      class="codicon codicon-check-two"
                      style="font-size: 6px; margin-left: -1px"
                    />
                  </div>
                </div>
                <span class="todo-content" :class="`todo-${task.status}`">{{ task.content }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ToolMessageWrapper from '../common/ToolMessageWrapper.vue';
import ToolError from '../common/ToolError.vue';
import { asText } from './ompDiff';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

const props = defineProps<Props>();

interface TodoTask {
  content: string;
  status: string;
}

interface TodoPhase {
  name: string;
  tasks: TodoTask[];
}

const input = computed<any>(() => props.toolUse?.input ?? {});
const details = computed<any>(() => props.toolUseResult ?? {});

const op = computed<string>(() => {
  const fromInput = asText(input.value.op);
  if (fromInput) return fromInput;
  return asText(details.value?.op);
});

const phases = computed<TodoPhase[]>(() => {
  const raw = details.value?.phases;
  if (Array.isArray(raw)) {
    return raw.map((phase: any): TodoPhase => ({
      name: asText(phase?.name),
      tasks: Array.isArray(phase?.tasks)
        ? phase.tasks.map((task: any): TodoTask => ({
            content: asText(task?.content) || asText(task),
            status: asText(task?.status) || 'pending',
          }))
        : [],
    }));
  }
  // Still running: preview the init/append payload as pending items
  const list = input.value.list;
  if (Array.isArray(list)) {
    return list.map((phase: any): TodoPhase => ({
      name: asText(phase?.phase),
      tasks: Array.isArray(phase?.items)
        ? phase.items.map((item: any): TodoTask => ({
            content: asText(item),
            status: 'pending',
          }))
        : [],
    }));
  }
  return [];
});

const total = computed<number>(() =>
  phases.value.reduce((sum: number, phase: TodoPhase) => sum + phase.tasks.length, 0)
);
const completedCount = computed<number>(() =>
  phases.value.reduce(
    (sum: number, phase: TodoPhase) =>
      sum + phase.tasks.filter((task: TodoTask) => task.status === 'completed').length,
    0
  )
);

// Tasks changed by this call: completedTasks, plus an explicit done/start target
const highlight = computed<Set<string>>(() => {
  const marked = new Set<string>();
  const completed = details.value?.completedTasks;
  if (Array.isArray(completed)) {
    for (const entry of completed) {
      const content = asText(entry?.content);
      if (content) marked.add(content);
    }
  }
  const task = asText(input.value.task);
  if (task) marked.add(task);
  return marked;
});

const opSummary = computed<string>(() => {
  switch (op.value) {
    case 'init':
      return 'init';
    case 'append': {
      const items = input.value.items;
      const count = Array.isArray(items) ? items.length : 0;
      return `append ${count}`;
    }
    case 'view':
      return 'view';
    case 'done':
    case 'start':
    case 'block':
    case 'unblock':
    case 'rm':
    case 'drop': {
      const task = asText(input.value.task);
      return task ? `${op.value} ${task}` : op.value;
    }
    default:
      return op.value;
  }
});

function phaseDone(phase: TodoPhase): number {
  return phase.tasks.filter((task: TodoTask) => task.status === 'completed').length;
}
</script>

<style scoped>
.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.op-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: color-mix(in srgb, var(--vscode-foreground) 70%, transparent);
  font-size: 0.85em;
}

.todo-count {
  margin-left: auto;
  flex-shrink: 0;
  color: color-mix(in srgb, var(--vscode-foreground) 60%, transparent);
  font-size: 0.8em;
}

.todo-phases {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
  max-height: 400px;
  overflow-y: auto;
}

.phase-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 8px 2px;
}

.phase-name {
  font-size: 0.8em;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--vscode-foreground) 65%, transparent);
}

.phase-count {
  font-size: 0.75em;
  color: color-mix(in srgb, var(--vscode-foreground) 45%, transparent);
}

.todo-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.todo-item {
  padding: 3px 8px;
  border-radius: 4px;
  transition: background-color 0.1s ease;
}

.todo-item:hover {
  background-color: color-mix(in srgb, var(--vscode-list-hoverBackground) 30%, transparent);
}

.todo-item.is-changed {
  background-color: color-mix(in srgb, var(--vscode-charts-blue) 14%, transparent);
}

.todo-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.todo-item-indicator.is-blocked {
  width: auto;
  height: auto;
  border: none;
  opacity: 1;
  color: var(--vscode-editorWarning-foreground);
}

.todo-item-indicator.is-blocked .codicon {
  font-size: 12px;
  line-height: 1;
}

.todo-content {
  flex: 1;
  min-width: 0;
  font-size: 0.9em;
  line-height: 1.4;
  color: var(--vscode-foreground);
}

.todo-content.todo-pending {
  opacity: 0.8;
}

.todo-content.todo-in_progress {
  color: var(--vscode-charts-blue);
  font-weight: 500;
}

.todo-content.todo-completed {
  opacity: 0.6;
  text-decoration: line-through;
}

.todo-content.todo-blocked {
  color: var(--vscode-editorWarning-foreground);
}

.todo-content.todo-dropped,
.todo-content.todo-abandoned {
  opacity: 0.5;
  text-decoration: line-through;
}
</style>
