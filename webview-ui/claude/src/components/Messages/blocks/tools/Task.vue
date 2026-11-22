<template>
  <ToolMessageWrapper
    tool-icon="codicon-hubot"
    tool-name="Agent"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <!-- Same icon as the terminal's "view diff" button -->
    <template #icon>
      <img :src="agentIcon" class="agent-icon" alt="" aria-hidden="true" />
    </template>

    <template #main>
      <span class="tool-label">Agent</span>
      <span v-if="subagentType" class="agent-badge">{{ subagentType }}</span>
      <span v-if="description" class="description-text">{{ description }}</span>
      <span v-if="running" class="codicon codicon-loading codicon-modifier-spin running-icon"></span>
    </template>

    <!-- One live line like the CLI: what it is doing and how much it did -->
    <template v-if="status" #preview>
      <SubagentStatusLine :status="status" :failed="failed" />
    </template>

    <template #expandable>
      <SubagentDetail
        :task="task"
        :messages="children"
        :prompt="prompt"
        :status="status"
        :running="running"
        :failed="failed"
      />

      <!-- Error content -->
      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';
import SubagentDetail from '../../SubagentDetail.vue';
import SubagentStatusLine from '../../SubagentStatusLine.vue';
import { subagentCalls, subagentStatus } from '../../../../utils/subagentCalls';
import agentIcon from '../../../../../../../media/icons/view-diff.png';
import { useLiveActivity } from '../../../../composables/useLiveActivity';
import { taskForToolUse } from '../../../../core/LiveActivity';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

const props = defineProps<Props>();
const activity = useLiveActivity();

// Subagent type
const subagentType = computed(() => {
  return props.toolUse?.input?.subagent_type || props.toolUseResult?.subagent_type;
});

// Task description
const description = computed(() => {
  return props.toolUse?.input?.description || props.toolUseResult?.description;
});

// Prompt content
const prompt = computed(() => {
  return props.toolUse?.input?.prompt || props.toolUseResult?.prompt;
});

// The CLI's task for this call (system/task_*); absent for history
const task = computed(() => taskForToolUse(activity.tasks.value, props.toolUse?.id));

// A background agent's tool_result arrives at once ("launched"): its task says
// when it is really done
const running = computed(() => {
  if (task.value) return task.value.status === 'running' || task.value.status === 'pending';
  return !props.toolResult && !props.toolUseResult;
});
const failed = computed(() => task.value?.status === 'failed' || !!props.toolResult?.is_error);

// Ticks once a second while running, for the elapsed time
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
watch(running, (isRunning) => {
  if (isRunning && !timer) {
    timer = setInterval(() => { now.value = Date.now(); }, 1000);
  } else if (!isRunning && timer) {
    clearInterval(timer);
    timer = undefined;
  }
}, { immediate: true });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

const children = computed(() => activity.subagentMessages.value[props.toolUse?.id] ?? []);

const childCalls = computed(() => subagentCalls(children.value as any[]));

const status = computed(() => subagentStatus(task.value, childCalls.value, running.value, now.value));

// Whether this is the permission request phase
const isPermissionRequest = computed(() => {
  const hasToolUseResult = !!props.toolUseResult;
  const hasToolResult = !!props.toolResult && !props.toolResult.is_error;
  return !hasToolUseResult && !hasToolResult && !task.value;
});

// Expanded by default during the permission request phase, collapsed once done
const shouldExpand = computed(() => {
  // Expand during the permission request phase
  if (isPermissionRequest.value) return true;

  // Expand when there is an error
  if (props.toolResult?.is_error) return true;

  return false;
});
</script>

<style scoped>
.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.agent-icon {
  display: block;
  height: 14px;
  width: auto;
}

.agent-badge {
  display: inline-flex;
  align-items: center;
  color: var(--vscode-charts-orange);
  font-size: 0.75em;
  font-weight: 600;
}

.description-text {
  font-size: 0.85em;
  color: color-mix(in srgb, var(--vscode-foreground) 85%, transparent);
}

.running-icon {
  font-size: 12px;
  opacity: 0.7;
  margin-left: auto;
}
</style>
