<template>
  <span :class="['tool-status-indicator', stateClass]">
    <span class="status-dot"></span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  state: 'success' | 'error' | 'pending' | null;
}

const props = defineProps<Props>();

const stateClass = computed(() => {
  switch (props.state) {
    case 'success':
      return 'status-success';
    case 'error':
      return 'status-error';
    case 'pending':
      return 'status-pending';
    default:
      return '';
  }
});
</script>

<style scoped>
.tool-status-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--vscode-foreground);
  opacity: 0.3;
}

.status-success .status-dot {
  background-color: var(--vscode-testing-iconPassed);
  opacity: 1;
}

.status-error .status-dot {
  background-color: var(--vscode-testing-iconFailed);
  opacity: 1;
}

.status-pending .status-dot {
  background-color: var(--vscode-progressBar-background);
  opacity: 1;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
</style>
