<template>
  <!-- ExitPlanMode: approve the plan and pick the mode to continue in (sent as
       a `setMode` permission update, which the CLI confirms with a
       system/status), or keep planning with feedback. The plan itself is the
       card in the transcript just above. -->
  <PromptFrame title="Ready to code?" :hint="hint">
    <template v-if="planFile" #aside>
      <a class="pa-link" href="#" :title="planFile" @click.prevent="openPlan">Open plan file</a>
    </template>
    <div v-if="planPreview" class="pa-plan">{{ planPreview }}</div>
    <div class="pa-question">Would you like to proceed?</div>
    <PromptOptions :options="options" @pick="onPick" @cancel="keepPlanning('')" />
  </PromptFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import type { PermissionRequest } from '../../core/PermissionRequest'
import type { ToolContext } from '../../types/tool'
import { agentName } from '../../utils/backend'
import PromptFrame from './PromptFrame.vue'
import PromptOptions, { type PromptOption } from './PromptOptions.vue'

const props = defineProps<{
  request: PermissionRequest
  context: ToolContext
  /** Permission modes the session may switch to (auto, bypass only when offered) */
  modes: string[]
}>()

const inputs = computed(() => props.request.inputs as Record<string, any>)
const planFile = computed(() => (typeof inputs.value.planFilePath === 'string' ? inputs.value.planFilePath : ''))
// First line only: the full plan is the card above
const planPreview = computed(() => {
  const plan = typeof inputs.value.plan === 'string' ? inputs.value.plan.trim() : ''
  const first = plan.split('\n').find((l: string) => l.trim()) ?? ''
  return first.replace(/^#+\s*/, '')
})

interface Choice extends PromptOption {
  mode?: PermissionMode
}

const choices = computed<Choice[]>(() => {
  const list: Choice[] = []
  if (props.modes.includes('auto')) list.push({ label: 'Yes, and use auto mode', mode: 'auto' })
  if (props.modes.includes('bypassPermissions')) {
    list.push({ label: 'Yes, and bypass permissions', mode: 'bypassPermissions' })
  }
  list.push({ label: 'Yes, and auto-accept edits', mode: 'acceptEdits' })
  list.push({ label: 'Yes, and manually approve edits', mode: 'default' })
  list.push({ label: `No, keep planning (tell ${agentName} what to change)`, input: true, hint: 'esc' })
  return list
})
const options = computed<PromptOption[]>(() => choices.value)

const hint = ['↑/↓ or number to select', 'Enter to confirm', 'Esc to keep planning']

function onPick(index: number, text: string) {
  const choice = choices.value[index]
  if (!choice) return
  if (choice.input || !choice.mode) {
    keepPlanning(text)
    return
  }
  props.request.accept(props.request.inputs, [
    { type: 'setMode', mode: choice.mode, destination: 'session' },
  ])
}

function keepPlanning(feedback: string) {
  if (feedback) {
    props.request.reject(
      `The user doesn't want to proceed with this plan yet. Stay in plan mode and revise the plan. The user said:\n${feedback}`,
      false
    )
  } else {
    props.request.reject(
      "The user doesn't want to proceed with this plan yet. Stay in plan mode. STOP what you are doing and wait for the user to tell you how to proceed.",
      true
    )
  }
}

function openPlan() {
  if (planFile.value) props.context.fileOpener.open(planFile.value)
}
</script>

<style scoped>
.pa-plan {
  color: var(--cs-fg-66);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pa-link {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
}

.pa-link:hover {
  text-decoration: underline;
}
</style>
