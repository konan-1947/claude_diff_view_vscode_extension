<template>
  <!-- The CLI asks through canUseTool for three different things: a question
       to the user, a plan to approve, and a plain tool permission. Each gets
       its own prompt; all of them resolve the request themselves. -->
  <AskUserQuestionPrompt
    v-if="request.toolName === 'AskUserQuestion'"
    :key="requestKey"
    :request="request"
  />
  <PlanApprovalPrompt
    v-else-if="request.toolName === 'ExitPlanMode'"
    :key="requestKey"
    :request="request"
    :context="context"
    :modes="modes"
  />
  <ToolPermissionPrompt v-else :key="requestKey" :request="request" :context="context" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PermissionRequest } from '../core/PermissionRequest';
import type { ToolContext } from '../types/tool';
import AskUserQuestionPrompt from './Permission/AskUserQuestionPrompt.vue';
import PlanApprovalPrompt from './Permission/PlanApprovalPrompt.vue';
import ToolPermissionPrompt from './Permission/ToolPermissionPrompt.vue';

interface Props {
  request: PermissionRequest;
  context: ToolContext;
  /** Permission modes the session may use (plan approval offers them) */
  modes?: string[];
}

const props = withDefaults(defineProps<Props>(), { modes: () => [] });

// A new request (even for the same tool) mounts a fresh prompt: cursor and
// typed feedback must not carry over from the previous ask.
let seq = 0;
const keys = new WeakMap<PermissionRequest, number>();
const requestKey = computed(() => {
  let key = keys.get(props.request);
  if (key === undefined) {
    key = ++seq;
    keys.set(props.request, key);
  }
  return key;
});
</script>
