<template>
  <component
    :is="toolComponent"
    :tool-use="toolUse"
    :tool-result="toolResult"
    :tool-use-result="toolUseResult"
    :context="context"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import type { ToolUseContentBlock } from '../../../models/ContentBlock';
import type { ContentBlockWrapper } from '../../../models/ContentBlockWrapper';
import type { ToolContext } from '../../../types/tool';

// Import all tool components
import ReadTool from './tools/Read.vue';
import WriteTool from './tools/Write.vue';
import EditTool from './tools/Edit.vue';
import BashTool from './tools/Bash.vue';
import GlobTool from './tools/Glob.vue';
import GrepTool from './tools/Grep.vue';
import BashOutputTool from './tools/BashOutput.vue';
import ExitPlanModeTool from './tools/ExitPlanMode.vue';
import KillShellTool from './tools/KillShell.vue';
import McpTool from './tools/McpTool.vue';
import MultiEditTool from './tools/MultiEdit.vue';
import NotebookEditTool from './tools/NotebookEdit.vue';
import SlashCommandTool from './tools/SlashCommand.vue';
import TaskTool from './tools/Task.vue';
import TodoWriteTool from './tools/TodoWrite.vue';
import WebFetchTool from './tools/WebFetch.vue';
import WebSearchTool from './tools/WebSearch.vue';
import DefaultTool from './tools/Default.vue';
import AskUserQuestionTool from './tools/AskUserQuestion.vue';
import ReplTool from './tools/REPL.vue';
import PollTool from './tools/Poll.vue';

interface Props {
  block: ToolUseContentBlock;
  context?: ToolContext;
  wrapper?: ContentBlockWrapper;
}

const props = defineProps<Props>();

// 🔥 Wrap alien-signals with useSignal so Vue can track reactive changes
const toolResult = props.wrapper ? useSignal(props.wrapper.toolResult) : ref(undefined);

// Structured tool output. A plain property on the wrapper, set right before the
// reactive tool_result, so depend on toolResult to re-read it when the result lands.
const toolUseResult = computed(() => {
  void toolResult.value;
  if (!props.wrapper) return undefined;
  return props.wrapper.toolUseResult;
});

// Tool use info
const toolUse = computed(() => {
  return {
    name: props.block.name,
    input: props.block.input,
    id: props.block.id,
  };
});

// Pick the component based on the tool name
const toolComponent = computed(() => {
  const name = props.block.name;

  // MCP tool match (starts with mcp__)
  if (name.startsWith('mcp__')) {
    return McpTool;
  }

  switch (name) {
    case 'Read':
      return ReadTool;
    case 'Write':
      return WriteTool;
    case 'Edit':
      return EditTool;
    case 'Bash':
      return BashTool;
    case 'Glob':
      return GlobTool;
    case 'Grep':
      return GrepTool;
    case 'BashOutput':
      return BashOutputTool;
    case 'ExitPlanMode':
      return ExitPlanModeTool;
    case 'AskUserQuestion':
      return AskUserQuestionTool;
    case 'KillShell':
      return KillShellTool;
    case 'MultiEdit':
      return MultiEditTool;
    case 'NotebookEdit':
      return NotebookEditTool;
    case 'SlashCommand':
      return SlashCommandTool;
    case 'Task':
    case 'Agent':  // the CLI's current name for Task
      return TaskTool;
    case 'TodoWrite':
      return TodoWriteTool;
    case 'WebFetch':
      return WebFetchTool;
    case 'WebSearch':
      return WebSearchTool;
    case 'REPL':  // Code Mode
      return ReplTool;
    case 'Poll':
      return PollTool;
    default:
      return DefaultTool;
  }
});
</script>

<style scoped>
/* Tool block styles are managed by each tool component */
</style>
