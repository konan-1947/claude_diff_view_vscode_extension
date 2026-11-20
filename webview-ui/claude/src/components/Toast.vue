<template>
  <Transition name="toast">
    <div v-if="visible" :class="['toast', `toast-${variant}`]" role="alert">
      <span :class="['toast-icon', 'codicon', iconClass]" />
      <span class="toast-message">{{ message }}</span>
      <button class="toast-close" @click="dismiss" aria-label="Close">
        <span class="codicon codicon-close" />
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, watch, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  visible: boolean
  message: string
  variant?: 'error' | 'warning' | 'info'
  duration?: number
}>(), {
  variant: 'error',
  duration: 8000,
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const iconClass = computed(() => {
  switch (props.variant) {
    case 'error': return 'codicon-error'
    case 'warning': return 'codicon-warning'
    case 'info': return 'codicon-info'
    default: return 'codicon-error'
  }
})

let timer: ReturnType<typeof setTimeout> | undefined

function dismiss() {
  emit('update:visible', false)
}

watch(() => props.visible, (val) => {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  if (val && props.duration > 0) {
    timer = setTimeout(dismiss, props.duration)
  }
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.toast {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  max-width: 480px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  pointer-events: auto;
}

.toast-error {
  background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
  border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
  color: var(--vscode-errorForeground, #f48771);
}

.toast-warning {
  background-color: var(--vscode-inputValidation-warningBackground, #352a05);
  border: 1px solid var(--vscode-inputValidation-warningBorder, #9d8600);
  color: var(--vscode-foreground);
}

.toast-info {
  background-color: var(--vscode-inputValidation-infoBackground, #063b49);
  border: 1px solid var(--vscode-inputValidation-infoBorder, #007acc);
  color: var(--vscode-foreground);
}

.toast-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.toast-error .toast-icon {
  color: var(--vscode-errorForeground, #f48771);
}

.toast-warning .toast-icon {
  color: var(--vscode-editorWarning-foreground, #cca700);
}

.toast-info .toast-icon {
  color: var(--vscode-editorInfo-foreground, #3794ff);
}

.toast-message {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  /* Allow multi-line but cap at 3 lines */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  word-break: break-word;
}

.toast-close {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  cursor: pointer;
  flex-shrink: 0;
  color: inherit;
  opacity: 0.6;
  font-size: 12px;
  transition: opacity 0.15s;
}

.toast-close:hover {
  opacity: 1;
}

/* Transition */
.toast-enter-active {
  transition: all 0.25s ease-out;
}

.toast-leave-active {
  transition: all 0.2s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}
</style>
