<template>
  <!-- Pass the wrapper selectively based on block.type -->
  <!-- Only tool_use needs the wrapper to access the toolResult Signal -->
  <component
    v-if="block.type === 'tool_use'"
    :is="blockComponent"
    :block="block"
    :wrapper="wrapper"
    :context="context"
  />
  <!-- Other types do not need the wrapper, so it is not rendered into the DOM -->
  <component
    v-else
    :is="blockComponent"
    :block="block"
    :context="context"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ContentBlockType } from '../../models/ContentBlock';
import type { ContentBlockWrapper } from '../../models/ContentBlockWrapper';
import type { ToolContext } from '../../types/tool';

// Import all content block components
import TextBlock from './blocks/TextBlock.vue';
import ThinkingBlock from './blocks/ThinkingBlock.vue';
import ImageBlock from './blocks/ImageBlock.vue';
import DocumentBlock from './blocks/DocumentBlock.vue';
import InterruptBlock from './blocks/InterruptBlock.vue';
import LLMErrorBlock from './blocks/LLMErrorBlock.vue';
import SelectionBlock from './blocks/SelectionBlock.vue';
import OpenedFileBlock from './blocks/OpenedFileBlock.vue';
import DiagnosticsBlock from './blocks/DiagnosticsBlock.vue';
import ToolBlock from './blocks/ToolBlock.vue';
import ToolResultBlock from './blocks/ToolResultBlock.vue';
import UnknownBlock from './blocks/UnknownBlock.vue';

interface Props {
  block: ContentBlockType;
  context?: ToolContext;
  wrapper?: ContentBlockWrapper;
}

const props = defineProps<Props>();

// Pick the component based on block.type
const blockComponent = computed(() => {
  switch (props.block.type) {
    case 'text':
      return TextBlock;
    case 'thinking':
      return ThinkingBlock;
    case 'image':
      return ImageBlock;
    case 'document':
      return DocumentBlock;
    case 'interrupt':
      return InterruptBlock;
    case 'llm_error':
      return LLMErrorBlock;
    case 'selection':
      return SelectionBlock;
    case 'opened_file':
      return OpenedFileBlock;
    case 'diagnostics':
      return DiagnosticsBlock;
    case 'tool_use':
      return ToolBlock;
    case 'tool_result':
      return ToolResultBlock;
    default:
      return UnknownBlock;
  }
});
</script>
