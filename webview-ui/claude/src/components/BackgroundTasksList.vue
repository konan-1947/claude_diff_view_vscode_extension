<template>
  <div v-if="rows.length > 0" class="bg-tasks">
    <!-- Closed: the CLI's panel under the prompt — status line, then the tree
         (main as the root, one row per background task) -->
    <div v-if="!open" class="bg-panel">
      <div class="bg-summary" @click="openDialog()">
        <span class="bg-mark">▸▸</span>
        <span v-if="permissionMode === 'auto'">auto mode on</span>
        <span v-if="permissionMode === 'auto'" class="bg-sep">·</span>
        <span>{{ rows.length }} background task{{ rows.length === 1 ? '' : 's' }}</span>
        <template v-if="busy">
          <span class="bg-sep">·</span>
          <span>esc to interrupt</span>
        </template>
        <span class="bg-sep">·</span>
        <span>↓ to manage</span>
      </div>
      <div class="bg-tree">
        <div class="bg-tree-row bg-tree-main">
          <span class="bg-dot bg-dot-main">●</span>
          <span class="bg-main-label">main</span>
        </div>
        <div
          v-for="task in rows"
          :key="task.taskId"
          class="bg-tree-row"
          :title="task.description"
          @click="openInDialog(task.taskId)"
        >
          <span class="bg-dot">○</span>
          <span class="bg-type">{{ task.subagentType || (task.isAgent ? 'agent' : 'shell') }}</span>
          <span class="bg-desc">{{ task.description || task.taskId }}</span>
          <span v-if="task.stats" class="bg-stats">{{ task.stats }}</span>
          <span v-if="errors[task.taskId]" class="bg-error" :title="errors[task.taskId]">{{ errors[task.taskId] }}</span>
        </div>
      </div>
    </div>

    <!-- Open: takes the input's place, like the CLI's background tasks dialog.
         Fixed height, so going between the list and a task never moves anything -->
    <div
      v-else
      ref="dialogRef"
      class="bg-dialog"
      tabindex="-1"
      @keydown="onKeydown"
      @focusout="onFocusOut"
    >
      <template v-if="view === 'list' || !current">
        <div class="bg-title-row">
          <span class="bg-title">Background tasks</span>
          <span class="codicon codicon-close bg-close" title="Close (Esc)" @click="close()"></span>
        </div>
        <div class="bg-kind-line">{{ rows.length }} active</div>
        <div class="bg-body bg-list">
          <div
            v-for="(task, index) in rows"
            :key="task.taskId"
            class="bg-row"
            :class="{ selected: index === selected }"
            :title="task.description"
            @mousedown.prevent
            @click="selected = index; showTask(task.taskId)"
          >
            <span class="bg-pointer">{{ index === selected ? '›' : '' }}</span>
            <OmpMark v-if="task.isAgent && isOmp" class="bg-kind bg-agent-icon bg-omp-icon" />
            <img v-else-if="task.isAgent" :src="agentIcon" class="bg-kind bg-agent-icon" alt="" aria-hidden="true" />
            <span v-else class="codicon codicon-terminal bg-kind"></span>
            <span class="bg-desc">{{ task.description || task.taskId }}</span>
            <span v-if="task.stats" class="bg-stats">{{ task.stats }}</span>
            <span v-if="errors[task.taskId]" class="bg-error" :title="errors[task.taskId]">{{ errors[task.taskId] }}</span>
          </div>
        </div>
        <div class="bg-footer">↑/↓ to select&nbsp;&nbsp;&nbsp;Enter to view&nbsp;&nbsp;&nbsp;x to stop&nbsp;&nbsp;&nbsp;Esc to close</div>
      </template>

      <template v-else>
        <div class="bg-title-row">
          <span class="bg-title bg-title-task" :title="current.description">{{ current.description || current.taskId }}</span>
          <span class="codicon codicon-close bg-close" title="Close (Esc)" @click="close()"></span>
        </div>
        <div class="bg-kind-line">{{ current.isAgent ? (current.subagentType || 'agent') : 'shell' }}</div>
        <div class="bg-fields">
          <span class="bg-field-name">Status:</span>
          <span :class="{ 'bg-error-text': errors[current.taskId] }">{{ currentStatus }}</span>
          <span class="bg-field-name">Runtime:</span>
          <span>{{ current.runtime || '—' }}</span>
          <template v-if="current.isAgent && current.info?.totalTokens">
            <span class="bg-field-name">Tokens:</span>
            <span>{{ formatTokenCount(current.info.totalTokens) }}</span>
          </template>
          <template v-if="!current.isAgent && currentShell?.command">
            <span class="bg-field-name">Command:</span>
            <span class="bg-command" :title="currentShell.command">{{ currentShell.command }}</span>
          </template>
        </div>
        <div class="bg-section">{{ current.isAgent ? 'Progress' : 'Output' }}</div>
        <div v-if="current.isAgent" class="bg-body bg-agent-body">
          <SubagentDetail
            :task="current.info"
            :messages="current.messages"
            :prompt="current.info?.prompt"
            :status="current.status"
            :running="true"
          />
        </div>
        <BackgroundShellDetail
          v-else
          :key="current.taskId"
          class="bg-body"
          :resolve="() => findShell(current!.taskId, current!.info?.toolUseId)"
          :read-output="readTaskOutput"
        />
        <div class="bg-footer">← to go back&nbsp;&nbsp;&nbsp;x to stop&nbsp;&nbsp;&nbsp;Enter/Space to close&nbsp;&nbsp;&nbsp;Esc to close</div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import SubagentDetail from './Messages/SubagentDetail.vue';
import BackgroundShellDetail, { type BackgroundShell } from './BackgroundShellDetail.vue';
import { subagentCalls, subagentStatus } from '../utils/subagentCalls';
import agentIcon from '../../../../media/icons/view-diff.png';
import OmpMark from './OmpMark.vue';
import { isOmp } from '../utils/backend';
import type { BackgroundTask, TaskInfo } from '../core/LiveActivity';
import { formatDuration, formatTokenCount, isTaskFinished } from '../core/LiveActivity';

/**
 * Tasks the CLI runs in the background (a Bash call with run_in_background, a
 * background subagent). Closed, one line under the input; opened (↓ from the
 * input, or a click), a dialog in the input's place, as the CLI does: a list
 * (↑/↓ Enter x Esc), and one task's status, command and output (← x Enter Esc).
 */
interface Props {
  tasks: BackgroundTask[];
  /** Details from system/task_* (start time, tokens), by task id */
  taskInfo: Record<string, TaskInfo>;
  stopTask: (taskId: string) => Promise<string | undefined>;
  /** Subagent messages by the tool_use id of their Agent call */
  subagentMessages: Record<string, any[]>;
  /** Command and output file of a background Bash task */
  findShell: (taskId: string, toolUseId?: string) => BackgroundShell | undefined;
  readTaskOutput: (path: string) => Promise<{ output?: string; truncated?: boolean; error?: string }>;
  /** The session's permission mode (`auto` shows the mode segment) */
  permissionMode?: string;
  /** The main turn is running (`esc to interrupt`) */
  busy?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** The dialog closed with the keyboard (or its last task ended): focus goes back to the chat input */
  (e: 'exit'): void;
  /** The dialog opened or closed: the input hides while it is open */
  (e: 'openChange', open: boolean): void;
}>();

const stopping = reactive<Record<string, boolean>>({});
const errors = reactive<Record<string, string>>({});

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  if (open.value) emit('openChange', false);
});

const open = ref(false);
const view = ref<'list' | 'task'>('list');
const openTask = ref<string | null>(null);
const selected = ref(0);
const dialogRef = ref<HTMLElement>();

// Both sources: `tasks` (background_tasks_changed) and the backgrounded tasks
// of `taskInfo` (task_started/task_updated), so a subagent shows even before the
// CLI lists it. De-duplicated by task id, `tasks` order first.
const rows = computed(() => {
  const listed = props.tasks;
  const listedIds = new Set(listed.map((t) => t.taskId));
  const extra = Object.values(props.taskInfo).filter(
    (t) => t.backgrounded && !listedIds.has(t.taskId) && !isTaskFinished(t),
  );
  const all = [
    ...listed,
    ...extra.map((t) => ({
      taskId: t.taskId,
      taskType: t.taskType ?? '',
      description: t.description ?? '',
      subagentType: t.subagentType,
    })),
  ];
  return all.filter((t) => !isTaskFinished(props.taskInfo[t.taskId])).map((task) => {
    const info = props.taskInfo[task.taskId];
    const runtime = info ? formatDuration(now.value - info.startedAt) : '';
    const stats = [
      runtime,
      info?.totalTokens ? `↓ ${formatTokenCount(info.totalTokens)} tokens` : '',
    ].filter(Boolean).join(' · ');
    const taskType = task.taskType || info?.taskType || '';
    const isAgent = taskType !== 'local_bash';
    const messages = (info?.toolUseId && props.subagentMessages[info.toolUseId]) || [];
    return {
      ...task,
      isAgent,
      runtime,
      stats,
      info,
      messages,
      status: isAgent && open.value && view.value === 'task' && openTask.value === task.taskId
        ? subagentStatus(info, subagentCalls(messages), true, now.value)
        : null,
    };
  });
});

const current = computed(() => rows.value.find((r) => r.taskId === openTask.value));
const currentShell = computed(() =>
  current.value && !current.value.isAgent ? props.findShell(current.value.taskId, current.value.info?.toolUseId) : undefined
);
const currentStatus = computed(() => {
  const task = current.value;
  if (!task) return '';
  if (errors[task.taskId]) return errors[task.taskId];
  if (stopping[task.taskId]) return 'stopping…';
  return task.info?.status ?? 'running';
});

watch(open, (v) => emit('openChange', v));

watch(
  () => rows.value.length,
  (n) => {
    if (selected.value >= n) selected.value = Math.max(0, n - 1);
    if (!open.value) return;
    // The last task ended: give the input back
    if (n === 0) close();
    // The task on screen ended: back to the list
    else if (view.value === 'task' && !current.value) view.value = 'list';
  }
);

function focusDialog() {
  void nextTick(() => dialogRef.value?.focus());
}

/** Open the dialog (↓ from the chat input); false when there is nothing to show */
function openDialog(): boolean {
  if (rows.value.length === 0) return false;
  if (selected.value >= rows.value.length) selected.value = 0;
  // A single task opens straight on it, as in the CLI
  if (rows.value.length === 1) {
    openTask.value = rows.value[0].taskId;
    view.value = 'task';
  } else {
    view.value = 'list';
  }
  open.value = true;
  focusDialog();
  return true;
}

function showTask(taskId: string) {
  openTask.value = taskId;
  view.value = 'task';
  focusDialog();
}

/** A row of the closed tree: the dialog opens on it */
function openInDialog(taskId: string) {
  open.value = true;
  showTask(taskId);
}

function backToList() {
  const index = rows.value.findIndex((r) => r.taskId === openTask.value);
  if (index >= 0) selected.value = index;
  view.value = 'list';
}

function close(toInput = true) {
  if (!open.value) return;
  open.value = false;
  if (toInput) emit('exit');
}

// Focus left the dialog (a click in the transcript): close it, without taking
// the focus back. Switching windows blurs too, and keeps it open.
function onFocusOut() {
  setTimeout(() => {
    if (!open.value || !document.hasFocus()) return;
    if (dialogRef.value?.contains(document.activeElement)) return;
    close(false);
  }, 0);
}

function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key;
  if (view.value === 'list' || !current.value) {
    const task = rows.value[selected.value];
    switch (key) {
      case 'ArrowDown':
        selected.value = Math.min(rows.value.length - 1, selected.value + 1);
        break;
      case 'ArrowUp':
        selected.value = Math.max(0, selected.value - 1);
        break;
      case 'Enter':
      case ' ':
      case 'ArrowRight':
        if (task) showTask(task.taskId);
        break;
      case 'x':
      case 'X':
        if (task) void kill(task.taskId);
        break;
      case 'Escape':
      case 'ArrowLeft':
        close();
        break;
      default:
        return;
    }
  } else {
    switch (key) {
      case 'ArrowLeft':
        backToList();
        break;
      case 'x':
      case 'X':
        void kill(current.value.taskId);
        break;
      case 'Enter':
      case ' ':
      case 'Escape':
        close();
        break;
      default:
        return;
    }
  }
  e.preventDefault();
  e.stopPropagation();
}

defineExpose({ focusList: openDialog });

async function kill(taskId: string) {
  if (stopping[taskId]) return;
  stopping[taskId] = true;
  delete errors[taskId];
  const error = await props.stopTask(taskId);
  stopping[taskId] = false;
  if (error) errors[taskId] = error;
}
</script>

<style scoped>
.bg-tasks {
  margin-top: 4px;
  font-size: 12px;
  color: var(--vscode-input-placeholderForeground);
}

.bg-panel {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  line-height: 18px;
  color: var(--vscode-descriptionForeground);
}

.bg-summary {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  cursor: pointer;
  user-select: none;
}

.bg-mark {
  color: var(--vscode-editorWarning-foreground, var(--vscode-focusBorder));
}

.bg-sep {
  opacity: 0.7;
}

.bg-tree {
  display: flex;
  flex-direction: column;
}

.bg-tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
  white-space: nowrap;
}

.bg-tree-row:not(.bg-tree-main) {
  cursor: pointer;
}

.bg-dot {
  flex-shrink: 0;
}

.bg-dot-main {
  color: var(--vscode-editorWarning-foreground, var(--vscode-focusBorder));
}

.bg-main-label {
  font-weight: 600;
  color: var(--vscode-foreground);
}

.bg-type {
  flex-shrink: 0;
  opacity: 0.7;
}

/* The dialog: the CLI's rule above, then title, kind, fields, body, keys */
.bg-dialog {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  /* Most of the panel's height (still fixed for a given window, so going
     between the list and a task never moves anything) */
  height: max(300px, 65vh);
  padding: 10px 12px 8px;
  border-top: 1px solid var(--vscode-focusBorder);
  outline: none;
  font-family: var(--vscode-font-family);
  font-size: 13px;
  line-height: 20px;
  color: var(--vscode-editor-foreground);
}

.bg-title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-shrink: 0;
}

.bg-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  color: var(--vscode-textLink-foreground);
}

.bg-title-task {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.bg-close {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0.5;
  cursor: pointer;
}

.bg-close:hover {
  opacity: 1;
}

.bg-kind-line {
  flex-shrink: 0;
  margin-bottom: 10px;
  opacity: 0.7;
}

.bg-fields {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 12px;
  flex-shrink: 0;
  margin-bottom: 10px;
}

.bg-field-name {
  font-weight: 600;
}

.bg-command {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-all;
}

.bg-section {
  flex-shrink: 0;
  font-weight: 600;
}

.bg-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.bg-agent-body {
  font-family: var(--vscode-font-family);
  font-size: 13px;
}

.bg-footer {
  flex-shrink: 0;
  padding-top: 8px;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.6;
}

.bg-list {
  display: flex;
  flex-direction: column;
}

.bg-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 24px;
  padding: 2px 6px 2px 0;
  border-radius: 4px;
  cursor: pointer;
}

.bg-row:hover {
  background-color: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
}

.bg-row.selected {
  color: var(--vscode-textLink-foreground);
}

.bg-pointer {
  flex-shrink: 0;
  width: 10px;
  text-align: center;
}

.bg-kind {
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0.7;
}

.bg-agent-icon {
  display: block;
  height: 12px;
  width: auto;
  opacity: 1;
}
/* OMP tabs: omp's own mark (108×100) in place of the agent icon */
.bg-omp-icon {
  width: 13px;
}

.bg-desc {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bg-stats {
  flex-shrink: 0;
  white-space: nowrap;
  opacity: 0.7;
}

.bg-error {
  flex-shrink: 1;
  min-width: 0;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vscode-errorForeground);
}

.bg-error-text {
  color: var(--vscode-errorForeground);
}
</style>
