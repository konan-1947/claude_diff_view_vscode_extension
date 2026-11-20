<template>
  <TabsRoot
    v-model="model"
    class="scope-tabs"
  >
    <TabsList class="scope-tabs-list" aria-label="Settings scope">
      <TabsTrigger value="global" class="scope-tab-trigger">
        <span class="codicon codicon-account" />
        <span>{{ activeProfile ? `User (${activeProfile})` : 'User' }}</span>
      </TabsTrigger>
      <Tooltip
        :content="!hasWorkspace ? 'Open a workspace to use Workspace settings' : ''"
        :delay-duration="hasWorkspace ? 99999 : 400"
      >
        <TabsTrigger
          value="shared"
          class="scope-tab-trigger"
          :disabled="!hasWorkspace"
        >
          <span class="codicon codicon-folder" />
          <span>Workspace</span>
        </TabsTrigger>
      </Tooltip>
      <Tooltip
        :content="!hasWorkspace ? 'Open a workspace to use Local settings' : ''"
        :delay-duration="hasWorkspace ? 99999 : 400"
      >
        <TabsTrigger
          value="local"
          class="scope-tab-trigger"
          :disabled="!hasWorkspace"
        >
          <span class="codicon codicon-lock" />
          <span>Local</span>
        </TabsTrigger>
      </Tooltip>
      <TabsIndicator class="scope-tabs-indicator" />
    </TabsList>
  </TabsRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  TabsRoot,
  TabsList,
  TabsTrigger,
  TabsIndicator
} from 'reka-ui';
import Tooltip from '../Common/Tooltip.vue';
import type { SettingsScope } from '../../composables/useSettingsStore';

const props = defineProps<{
  modelValue: SettingsScope;
  hasWorkspace: boolean;
  activeProfile?: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: SettingsScope): void;
}>();

const model = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val as SettingsScope)
});
</script>

<style scoped>
.scope-tabs {
  display: flex;
  align-items: center;
}

.scope-tabs-list {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 2px;
  border-radius: 6px;
  background: var(--cursor-bg-tertiary);
  border: 1px solid var(--cursor-stroke-quaternary);
}

.scope-tab-trigger {
  all: unset;
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  color: var(--cursor-text-tertiary);
  cursor: pointer;
  user-select: none;
  transition: color 0.15s ease;
  white-space: nowrap;
}

.scope-tab-trigger .codicon {
  font-size: 12px;
}

.scope-tab-trigger:hover:not(:disabled) {
  color: var(--cursor-text-secondary);
}

.scope-tab-trigger[data-state='active'] {
  color: var(--cursor-text-primary);
}

.scope-tab-trigger:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.scope-tabs-indicator {
  position: absolute;
  left: 0;
  height: calc(100% - 4px);
  top: 2px;
  border-radius: 4px;
  background: var(--cursor-bg-secondary);
  border: 1px solid var(--cursor-stroke-tertiary);
  transition: width 0.15s ease, transform 0.15s ease;
}
</style>
