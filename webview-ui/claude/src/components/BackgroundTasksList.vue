<template>
  <div
    v-if="rows.length > 0"
    ref="rootRef"
    class="bg-tasks"
    :class="{ focused }"
    tabindex="-1"
    @keydown="onKeydown"
    @focusin="focused = true"
    @focusout="onFocusOut"
  >
    <div class="bg-header" @click="expanded = !expanded">
      <span class="codicon" :class="expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'"></span>
      <span class="codicon codicon-loading codicon-modifier-spin bg-spin"></span>
      <span>{{ rows.length }} background task{{ rows.length === 1 ? '' : 's' }}</span>
      <!-- Keys, in the header so showing them never changes the height -->
      <span class="bg-keys">
        <template v-if="confirmKill">press k again to stop</template>
        <template v-else-if="focused">↑↓ select&nbsp;&nbsp;Enter view&nbsp;&nbsp;k stop&nbsp;&nbsp;Esc back</template>
        <template v-else>↓ from the input</template>
      </span>
    </div>
    <div v-if="expanded" class="bg-list">
      <template v-for="(task, index) in rows" :key="task.taskId">
        <div
          class="bg-row"
          :class="{ clickable: true, open: openTask === task.taskId, selected: focused && index === selected }"
          :title="task.description"
          @mousedown.prevent
          @click="selected = index; focusList(); toggle(task.taskId)"
        >
          <img v-if="task.isAgent" :src="agentIcon" class="bg-kind bg-agent-icon" alt="" aria-hidden="true" />
          <span v-else class="codicon codicon-terminal bg-kind"></span>
          <span class="bg-desc">{{ task.description || task.taskId }}</span>
          <span v-if="task.stats" class="bg-stats">{{ task.stats }}</span>
          <span v-if="errors[task.taskId]" class="bg-error" :title="errors[task.taskId]">{{ errors[task.taskId] }}</span>
          <span
            class="codicon bg-chevron"
            :class="openTask === task.taskId ? 'codicon-chevron-down' : 'codicon-chevron-right'"
          ></span>
          <Tooltip content="Stop task">
            <div
              class="anysphere-icon-button bg-kill"
              :class="{ disabled: stopping[task.taskId] }"
              @click.stop="kill(task.taskId)"
            >
              <span class="codicon codicon-debug-stop text-[12px]!"></span>
            </div>
          </Tooltip>
        </div>
        <!-- What the subagent did so far (its tool calls), like opening its Agent card -->
        <div v-if="task.isAgent && openTask === task.taskId" class="bg-detail">
          <SubagentDetail
            :task="task.info"
            :messages="task.messages"
            :prompt="task.info?.prompt"
            :status="task.status"
            :running="true"
          />
        </div>
        <!-- Background shell: its command and what it printed so far -->
        <BackgroundShellDetail
          v-else-if="!task.isAgent && openTask === task.taskId"
          :resolve="() => findShell(task.taskId, task.info?.toolUseId)"
          :read-output="readTaskOutput"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import Tooltip from './Common/Tooltip.vue';
import SubagentDetail from './Messages/SubagentDetail.vue';
import BackgroundShellDetail, { type BackgroundShell } from './BackgroundShellDetail.vue';
import { subagentCalls, subagentStatus } from '../utils/subagentCalls';
import agentIcon from '../../../../media/icons/view-diff.png';
import type { BackgroundTask, TaskInfo } from '../core/LiveActivity';
import { formatDuration, formatTokenCount, isTaskFinished } from '../core/LiveActivity';

/**
 * Tasks the CLI runs in the background (a Bash call with run_in_background, a
 * background subagent), listed above the input with a stop button each, the
 * way the CLI lists them under its prompt.
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
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** ↑ past the first task, or Esc: focus goes back to the chat input */
  (e: 'exit'): void;
}>();
const expanded = ref(true);
const stopping = reactive<Record<string, boolean>>({});
const errors = reactive<Record<string, string>>({});
const openTask = ref<string | null>(null);

function toggle(taskId: string) {
  openTask.value = openTask.value === taskId ? null : taskId;
}

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

const rows = computed(() =>
  props.tasks.filter((task) => !isTaskFinished(props.taskInfo[task.taskId])).map((task) => {
    const info = props.taskInfo[task.taskId];
    const stats = [
      info?.totalTokens ? `${formatTokenCount(info.totalTokens)} tokens` : '',
      info ? formatDuration(now.value - info.startedAt) : '',
    ].filter(Boolean).join('   ');
    const isAgent = task.taskType !== 'local_bash';
    const messages = (info?.toolUseId && props.subagentMessages[info.toolUseId]) || [];
    return {
      ...task,
      isAgent,
      stats,
      info,
      messages,
      status: isAgent && openTask.value === task.taskId
        ? subagentStatus(info, subagentCalls(messages), true, now.value)
        : null,
    };
  })
);

// ---- Keyboard (as the CLI's task list: ↓ from the prompt, ↑↓ Enter k Esc) ----

const rootRef = ref<HTMLElement>();
const focused = ref(false);
const selected = ref(0);
/** Task waiting for the second `k` */
const confirmKill = ref<string | null>(null);

watch(
  () => rows.value.length,
  (n) => {
    if (selected.value >= n) selected.value = Math.max(0, n - 1);
    // The last task ended while the list had the focus: give it back to the input
    if (n === 0 && focused.value) {
      focused.value = false;
      exit();
    }
  }
);

/** Focus the list (↓ from the chat input); false when there is nothing to focus */
function focusList(): boolean {
  if (rows.value.length === 0) return false;
  expanded.value = true;
  if (selected.value >= rows.value.length) selected.value = 0;
  void nextTick(() => rootRef.value?.focus());
  return true;
}

function onFocusOut(e: FocusEvent) {
  if (rootRef.value?.contains(e.relatedTarget as Node | null)) return;
  focused.value = false;
  confirmKill.value = null;
}

function exit() {
  confirmKill.value = null;
  emit('exit');
}

function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const task = rows.value[selected.value];
  const key = e.key;
  if (key !== 'k' && key !== 'K') confirmKill.value = null;
  switch (key) {
    case 'ArrowDown':
      selected.value = Math.min(rows.value.length - 1, selected.value + 1);
      break;
    case 'ArrowUp':
      if (selected.value === 0) exit();
      else selected.value -= 1;
      break;
    case 'Enter':
    case ' ':
      if (task) toggle(task.taskId);
      break;
    case 'ArrowRight':
      if (task) openTask.value = task.taskId;
      break;
    case 'ArrowLeft':
      openTask.value = null;
      break;
    case 'Escape':
      if (openTask.value) openTask.value = null;
      else exit();
      break;
    case 'k':
    case 'K':
      if (!task) break;
      if (confirmKill.value === task.taskId) {
        confirmKill.value = null;
        void kill(task.taskId);
      } else {
        confirmKill.value = task.taskId;
      }
      break;
    default:
      return;
  }
  e.preventDefault();
  e.stopPropagation();
}

defineExpose({ focusList });

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
  outline: none;
  font-size: 12px;
  color: var(--vscode-input-placeholderForeground);
}

.bg-header {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding-left: 4px;
  cursor: pointer;
  user-select: none;
}

.bg-header .codicon {
  font-size: 12px;
  opacity: 0.6;
}

.bg-spin {
  font-size: 11px !important;
}

.bg-list {
  display: flex;
  flex-direction: column;
  padding: 2px 0 4px;
}

.bg-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 30px;
  box-sizing: border-box;
  padding: 4px 8px 4px 6px;
  border-radius: 4px;
}

.bg-keys {
  margin-left: auto;
  padding-right: 8px;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.7;
}

.bg-row.selected {
  background-color: var(--vscode-list-activeSelectionBackground, color-mix(in srgb, var(--vscode-foreground) 12%, transparent));
  color: var(--vscode-list-activeSelectionForeground, inherit);
}

.bg-row:hover {
  background-color: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
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

.bg-row.clickable {
  cursor: pointer;
}

.bg-chevron {
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0.6;
}

/* Same card as the Agent tool call; fixed height so opening it never
   resizes as the subagent works (its content scrolls instead) */
.bg-detail {
  box-sizing: border-box;
  height: 220px;
  margin: 2px 0 6px;
  padding: 8px 10px;
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--vscode-editor-foreground) 12%, transparent);
  border-radius: 12px;
  background: var(--vscode-editor-background);
  font-size: 13px;
}

.bg-desc {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vscode-input-foreground);
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

.bg-kill {
  flex-shrink: 0;
}

.bg-kill.disabled {
  opacity: 0.4;
  pointer-events: none;
}
</style>
