<template>
  <!-- A tool permission ask, with the CLI's three choices: "Yes", "Yes, and
       don't ask again for …" (saves the CLI's suggestions as rules) and "No,
       and tell Claude what to do differently" (a text row). -->
  <PromptFrame :title="title" :hint="hint">
    <template v-if="request.context.agentID" #aside>subagent</template>

    <div v-if="command" class="tp-command">
      <pre class="tp-code">{{ command }}</pre>
      <div v-if="commandDetail" class="tp-muted">{{ commandDetail }}</div>
    </div>
    <div v-else-if="filePath" class="tp-file">
      <a class="tp-link" href="#" :title="filePath" @click.prevent="openFile">{{ filePath }}</a>
    </div>
    <div v-else-if="url" class="tp-file">
      <span class="tp-code-inline">{{ url }}</span>
    </div>

    <details v-if="showDetails" class="tp-details">
      <summary>Details</summary>
      <pre class="tp-json">{{ inputJson }}</pre>
    </details>

    <div v-if="reason" class="tp-muted">{{ reason }}</div>

    <div class="tp-question">{{ question }}</div>
    <PromptOptions
      :options="options"
      :initial-index="request.context.defaultToNo ? options.length - 1 : 0"
      :digits="!request.context.defaultToNo"
      @pick="onPick"
      @cancel="reject('')"
    />
  </PromptFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PermissionRequest } from '../../core/PermissionRequest'
import type { ToolContext } from '../../types/tool'
import { alwaysAllowLabel } from '../../utils/permissionSuggestions'
import { agentName } from '../../utils/backend'
import PromptFrame from './PromptFrame.vue'
import PromptOptions, { type PromptOption } from './PromptOptions.vue'

const props = defineProps<{
  request: PermissionRequest
  context: ToolContext
}>()

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])

const toolName = computed(() => props.request.toolName)
const inputs = computed(() => props.request.inputs as Record<string, any>)

const command = computed(() =>
  SHELL_TOOLS.has(toolName.value) && typeof inputs.value.command === 'string' ? inputs.value.command : ''
)
// The CLI's `description` repeats the tool input's description for Bash
const commandDetail = computed(() =>
  typeof inputs.value.description === 'string' ? inputs.value.description : props.request.context.description ?? ''
)
const filePath = computed(() => {
  const p = inputs.value.file_path ?? inputs.value.notebook_path
  return EDIT_TOOLS.has(toolName.value) || toolName.value === 'Read' ? (typeof p === 'string' ? p : '') : ''
})
const url = computed(() => (typeof inputs.value.url === 'string' ? inputs.value.url : ''))
const baseName = computed(() => filePath.value.split(/[\\/]/).pop() || filePath.value)

const title = computed(() => {
  const ctx = props.request.context
  if (ctx.title) return ctx.title
  if (SHELL_TOOLS.has(toolName.value)) return `${toolName.value} command`
  if (toolName.value === 'Write') return 'Create file'
  if (EDIT_TOOLS.has(toolName.value)) return 'Edit file'
  if (toolName.value === 'Read') return 'Read file'
  if (toolName.value.startsWith('mcp__')) {
    const [, server, ...rest] = toolName.value.split('__')
    return `${rest.join('__') || toolName.value} (MCP: ${server})`
  }
  return ctx.displayName && ctx.displayName !== toolName.value ? ctx.displayName : toolName.value
})

const question = computed(() => {
  if (toolName.value === 'Write' && baseName.value) return `Do you want to create ${baseName.value}?`
  if (EDIT_TOOLS.has(toolName.value) && baseName.value) return `Do you want to make this edit to ${baseName.value}?`
  return 'Do you want to proceed?'
})

const reason = computed(() => {
  const ctx = props.request.context
  const parts: string[] = []
  if (ctx.decisionReason) parts.push(ctx.decisionReason)
  if (ctx.blockedPath && ctx.blockedPath !== filePath.value) parts.push(`Path: ${ctx.blockedPath}`)
  return parts.join('\n')
})

// Shell commands and file paths say it all; other tools show their input
const showDetails = computed(() => !command.value && Object.keys(inputs.value).length > 0)
const inputJson = computed(() => {
  try {
    return JSON.stringify(inputs.value, null, 2)
  } catch {
    return '{}'
  }
})

const alwaysLabel = computed(() =>
  props.request.context.suppressAlwaysAllowRule ? '' : alwaysAllowLabel(props.request.suggestions)
)

const options = computed<PromptOption[]>(() => {
  const list: PromptOption[] = [{ label: 'Yes' }]
  if (alwaysLabel.value) list.push({ label: alwaysLabel.value })
  list.push({ label: `No, and tell ${agentName} what to do differently`, input: true, hint: 'esc' })
  return list
})

const hint = computed(() =>
  props.request.context.defaultToNo
    ? ['↑/↓ to select', 'Enter to confirm', 'Esc to deny']
    : ['↑/↓ or number to select', 'Enter to confirm', 'Esc to deny']
)

function onPick(index: number, text: string) {
  const option = options.value[index]
  if (!option) return
  if (option.input) {
    reject(text)
  } else if (index === 0) {
    props.request.accept(props.request.inputs)
  } else {
    props.request.accept(props.request.inputs, props.request.suggestions)
  }
}

// Same texts as the CLI: with feedback the turn goes on (Claude reads it),
// without it the turn stops and waits for the user.
function reject(feedback: string) {
  const base =
    "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file)."
  if (feedback) {
    props.request.reject(`${base} To tell you how to proceed, the user said:\n${feedback}`, false)
  } else {
    props.request.reject(`${base} STOP what you are doing and wait for the user to tell you how to proceed.`, true)
  }
}

function openFile() {
  if (filePath.value) props.context.fileOpener.open(filePath.value)
}
</script>

<style scoped>
.tp-command {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tp-code {
  margin: 0;
  padding: 6px 8px;
  max-height: 160px;
  overflow: auto;
  border-radius: 4px;
  background: var(--cs-fg-8);
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.tp-code-inline {
  font-family: var(--vscode-editor-font-family, monospace);
  overflow-wrap: anywhere;
}

.tp-link {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
  font-family: var(--vscode-editor-font-family, monospace);
  overflow-wrap: anywhere;
}

.tp-link:hover {
  text-decoration: underline;
}

.tp-muted {
  color: var(--cs-fg-52);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tp-details summary {
  cursor: pointer;
  color: var(--cs-fg-52);
  user-select: none;
}

.tp-json {
  margin: 4px 0 0;
  padding: 6px 8px;
  max-height: 160px;
  overflow: auto;
  border-radius: 4px;
  background: var(--cs-fg-8);
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
}

.tp-question {
  margin-top: 2px;
}
</style>
