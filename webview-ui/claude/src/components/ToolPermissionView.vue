<template>
  <div v-if="permissionContent" class="tool-permission-view">
    <component :is="permissionContent" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { ToolContext } from '../types/tool';

interface Props {
  toolName: string;
  context: ToolContext;
  inputs: any;
}

interface Emits {
  (e: 'modify', newInputs: any): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const permissionContent = ref<any>(null);

const handleModify = (newInputs: any) => {
  emit('modify', newInputs);
};

onMounted(async () => {
  try {
    const toolModule = await loadToolModule(props.toolName);
    if (toolModule && toolModule.renderPermissionRequest) {
      permissionContent.value = toolModule.renderPermissionRequest(
        props.context,
        props.inputs,
        handleModify
      );
    }
  } catch (error) {
    console.warn(`[ToolPermissionView] Failed to load permission view for ${props.toolName}`, error);
  }
});

async function loadToolModule(toolName: string): Promise<any> {
  const toolMap: Record<string, () => Promise<any>> = {
    // Edit: () => import('../tools/EditTool'),
    // Read: () => import('../tools/ReadTool'),
    // Write: () => import('../tools/WriteTool'),
    // Bash: () => import('../tools/BashTool'),
  };

  const loader = toolMap[toolName];
  if (!loader) {
    return null;
  }

  try {
    return await loader();
  } catch {
    return null;
  }
}
</script>

<style scoped>
.tool-permission-view {
  margin-top: 8px;
}
</style>
