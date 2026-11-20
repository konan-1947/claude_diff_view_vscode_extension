<template>
  <ToolMessageWrapper
    tool-icon="codicon-globe"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="tool-label">Search</span>
      <span v-if="query" class="query-text">{{ query }}</span>
    </template>

    <!-- Expanded content: domain filter options -->
    <template v-if="hasExpandableContent" #expandable>
      <!-- Allowed domains -->
      <div v-if="allowedDomains && allowedDomains.length" class="detail-item">
        <div class="detail-label">
          <span class="codicon codicon-verified"></span>
          <span>Allowed domains:</span>
        </div>
        <div class="domain-list">
          <span v-for="domain in allowedDomains" :key="domain" class="domain-tag allowed">
            {{ domain }}
          </span>
        </div>
      </div>

      <!-- Blocked domains -->
      <div v-if="blockedDomains && blockedDomains.length" class="detail-item">
        <div class="detail-label">
          <span class="codicon codicon-error"></span>
          <span>Blocked domains:</span>
        </div>
        <div class="domain-list">
          <span v-for="domain in blockedDomains" :key="domain" class="domain-tag blocked">
            {{ domain }}
          </span>
        </div>
      </div>

      <!-- Error content -->
      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

const props = defineProps<Props>();

const query = computed(() => {
  return props.toolUse?.input?.query;
});

const allowedDomains = computed(() => {
  return props.toolUse?.input?.allowed_domains;
});

const blockedDomains = computed(() => {
  return props.toolUse?.input?.blocked_domains;
});

// Expandable content exists only with domain filter info or an error
const hasExpandableContent = computed(() => {
  // Expandable when there is an error
  if (props.toolResult?.is_error) return true;

  // Expandable when there is domain filter info
  const hasFilters = (allowedDomains.value && allowedDomains.value.length > 0) ||
                     (blockedDomains.value && blockedDomains.value.length > 0);

  return hasFilters;
});

// Whether this is the permission request phase
const isPermissionRequest = computed(() => {
  // toolUseResult present means it already finished (session load)
  const hasToolUseResult = !!props.toolUseResult;

  // A non-error toolResult means it already finished (live conversation)
  const hasToolResult = !!props.toolResult && !props.toolResult.is_error;

  // Neither present means the permission request phase
  return !hasToolUseResult && !hasToolResult;
});

// Expanded by default only during the permission request phase with domain filter info, collapsed once done
const shouldExpand = computed(() => {
  return hasExpandableContent.value && isPermissionRequest.value;
});
</script>

<style scoped>
.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.query-text {
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-charts-blue);
  background-color: color-mix(in srgb, var(--vscode-charts-blue) 15%, transparent);
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
  font-size: 0.9em;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.85em;
  padding: 6px 0;
}

.detail-label {
  display: flex;
  align-items: center;
  gap: 4px;
  color: color-mix(in srgb, var(--vscode-foreground) 70%, transparent);
  font-weight: 500;
}

.domain-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.domain-tag {
  font-family: var(--vscode-editor-font-family);
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 0.9em;
}

.domain-tag.allowed {
  color: var(--vscode-charts-green);
  background-color: color-mix(in srgb, var(--vscode-charts-green) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--vscode-charts-green) 30%, transparent);
}

.domain-tag.blocked {
  color: var(--vscode-charts-red);
  background-color: color-mix(in srgb, var(--vscode-charts-red) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--vscode-charts-red) 30%, transparent);
}
</style>
