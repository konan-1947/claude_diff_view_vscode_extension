<template>
  <div v-if="rows.length > 0" class="bg-tasks">
    <div class="bg-header" @click="expanded = !expanded">
      <span class="codicon" :class="expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'"></span>
      <span class="codicon codicon-loading codicon-modifier-spin bg-spin"></span>
      <span>{{ rows.length }} background task{{ rows.length === 1 ? '' : 's' }}</span>
    </div>
    <div v-if="expanded" class="bg-list">
      <template v-for="task in rows" :key="task.taskId">
        <div
          class="bg-row"
          :class="{ clickable: task.isAgent, open: openTask === task.taskId }"
          :title="task.description"
          @click="task.isAgent && toggle(task.taskId)"
        >
          <img v-if="task.isAgent" :src="agentIcon" class="bg-kind bg-agent-icon" alt="" aria-hidden="true" />
          <span v-else class="codicon codicon-terminal bg-kind"></span>
          <span class="bg-desc">{{ task.description || task.taskId }}</span>
          <span v-if="task.stats" class="bg-stats">{{ task.stats }}</span>
          <span v-if="errors[task.taskId]" class="bg-error" :title="errors[task.taskId]">{{ errors[task.taskId] }}</span>
          <span
            v-if="task.isAgent"
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
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import Tooltip from './Common/Tooltip.vue';
import SubagentDetail from './Messages/SubagentDetail.vue';
import { subagentCalls, subagentStatus } from '../utils/subagentCalls';
import agentIcon from '../../../../media/icons/view-diff.png';
import type { BackgroundTask, TaskInfo } from '../core/LiveActivity';
import { formatDuration, formatTokenCount } from '../core/LiveActivity';

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
}

const props = defineProps<Props>();
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

// A task the CLI already reported as finished is gone, even before its next list
const FINISHED = new Set(['completed', 'failed', 'killed', 'stopped']);

const rows = computed(() =>
  props.tasks.filter((task) => !FINISHED.has(props.taskInfo[task.taskId]?.status ?? '')).map((task) => {
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
  margin-bottom: 4px;
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
  padding: 2px 8px 2px 6px;
  border-radius: 4px;
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
