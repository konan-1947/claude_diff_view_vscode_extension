<template>
  <div v-if="visible && filesEdited.length > 0" class="file-edited-section">
    <Collapsible :default-open="initialExpanded">
      <template #trigger="{ open }">
        <!-- Files Edited header -->
        <div style="display: flex; justify-content: space-between; align-items: center; height: 26px; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 4px; flex-grow: 1; padding: 4px 8px;">
            <span
              class="codicon"
              :class="open ? 'codicon-chevron-down' : 'codicon-chevron-right'"
              style="color: var(--cs-fg-66); font-size: 14px;"
            />
            <div style="font-size: 12px; color: var(--cs-fg-66);">
              <span>{{ filesEdited.length }} Files Edited</span>
              <span style="margin-left: 8px;">
                <span style="color: var(--vscode-gitDecoration-addedResourceForeground);">+{{ totalAdditions }}</span>
                <span style="color: var(--vscode-gitDecoration-deletedResourceForeground); margin-left: 6px;">-{{ totalDeletions }}</span>
              </span>
            </div>
          </div>
        </div>
      </template>

      <!-- Files list -->
      <div style="padding: 4px 0;">
        <div
          v-for="(file, index) in filesEdited"
          :key="index"
          class="file-item"
        >
          <span style="color: var(--vscode-foreground);">{{ file.name }}</span>
          <span style="display: flex; gap: 6px;">
            <span style="color: var(--vscode-gitDecoration-addedResourceForeground);">+{{ file.additions || 0 }}</span>
            <span style="color: var(--vscode-gitDecoration-deletedResourceForeground);">-{{ file.deletions || 0 }}</span>
          </span>
        </div>
      </div>
    </Collapsible>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Collapsible from './Common/Collapsible.vue'
import type { FileEdit } from '../types/toolbar'

interface Props {
  filesEdited?: FileEdit[]
  visible?: boolean
  initialExpanded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  filesEdited: () => [],
  visible: false,
  initialExpanded: false
})

const totalAdditions = computed(() => {
  return props.filesEdited.reduce((sum, file) => sum + (file.additions || 0), 0)
})

const totalDeletions = computed(() => {
  return props.filesEdited.reduce((sum, file) => sum + (file.deletions || 0), 0)
})
</script>

<style scoped>
.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  transition: background-color 0.1s ease;
  cursor: pointer;
}

.file-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
}
</style>
