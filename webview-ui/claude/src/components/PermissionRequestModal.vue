<template>
  <div
    class="permission-request-container"
    tabIndex="0"
    @keydown="handleContainerKeyDown"
    data-permission-panel="1"
  >
    <div class="permission-request-content">
      <div class="permission-request-header">
        Do you want to proceed with <strong>{{ request.toolName }}</strong>?
      </div>

      <!-- Tool-specific permission UI (reserved extension point) -->
      <!-- <ToolPermissionView
        v-if="toolPermissionComponent"
        :toolName="request.toolName"
        :context="context"
        :inputs="request.inputs"
        @modify="handleModifyInputs"
      /> -->

      <!-- Generic Details as the fallback -->
      <div v-if="hasInputs" class="permission-request-description">
        <details>
          <summary>
            <span>Details</span>
            <svg
              class="chevron"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>
          <pre class="input-json">{{ displayInputs }}</pre>
        </details>
      </div>
    </div>

    <div class="button-container">
      <button class="button primary" @click="handleApprove">
        <span class="shortcut-num">1</span> Yes
      </button>
      <button v-if="showSecondButton" class="button" @click="handleApproveAndDontAsk">
        <span class="shortcut-num">2</span> Yes, and don't ask again
      </button>
      <button class="button" @click="handleReject">
        <span class="shortcut-num">{{ showSecondButton ? '3' : '2' }}</span> No
      </button>
      <input
        ref="inputRef"
        class="reject-message-input"
        placeholder="Tell Claude what to do instead"
        v-model="rejectMessage"
        @keydown="handleKeyDown"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PermissionRequest } from '../core/PermissionRequest';
import type { ToolContext } from '../types/tool';

interface Props {
  request: PermissionRequest;
  context: ToolContext;
  onResolve: (request: PermissionRequest, allow: boolean) => void;
}

const props = defineProps<Props>();

const inputRef = ref<HTMLInputElement | null>(null);
const rejectMessage = ref('');
const modifiedInputs = ref<any | undefined>(undefined);

const hasInputs = computed(() => Object.keys(props.request.inputs).length > 0);
const showSecondButton = computed(
  () => props.request.suggestions && props.request.suggestions.length > 0
);
const displayInputs = computed(() => {
  try {
    return JSON.stringify(modifiedInputs.value ?? props.request.inputs, null, 2);
  } catch {
    return '{}';
  }
});

const handleModifyInputs = (newInputs: any) => {
  modifiedInputs.value = newInputs;
};

const handleApprove = () => {
  if (modifiedInputs.value) {
    // Override inputs with the modified values
    (props.request as any).inputs = modifiedInputs.value;
  }
  props.onResolve(props.request, true);
};

const handleApproveAndDontAsk = () => {
  props.request.accept(props.request.inputs, props.request.suggestions || []);
};

const handleReject = () => {
  const trimmedMessage = rejectMessage.value.trim();
  const rejectionMessage = trimmedMessage
    ? `The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). The user provided the following reason for the rejection: ${trimmedMessage}`
    : "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.";

  props.request.reject(rejectionMessage, !trimmedMessage);
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleReject();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    handleReject();
  }
};

const handleContainerKeyDown = (e: KeyboardEvent) => {
  if (inputRef.value && document.activeElement === inputRef.value) {
    return;
  }

  if (e.key === '1') {
    e.preventDefault();
    handleApprove();
  } else if (e.key === '2') {
    e.preventDefault();
    if (showSecondButton.value) {
      handleApproveAndDontAsk();
    } else {
      handleReject();
    }
  } else if (e.key === '3' && showSecondButton.value) {
    e.preventDefault();
    handleReject();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    handleReject();
  }
};
</script>

<style scoped>
.permission-request-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  outline: none;
}

.permission-request-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.permission-request-header {
  font-size: 14px;
  line-height: 1.5;
  color: var(--vscode-foreground);
}

.permission-request-header strong {
  font-weight: 600;
}

.permission-request-description {
  font-size: 13px;
}

.permission-request-description details {
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.1);
}

.permission-request-description summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  user-select: none;
  list-style: none;
}

.permission-request-description summary::-webkit-details-marker {
  display: none;
}

.chevron {
  transition: transform 0.2s;
  color: var(--vscode-descriptionForeground);
}

.permission-request-description details[open] .chevron {
  transform: rotate(180deg);
}

.input-json {
  margin: 8px 0 0 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
  max-height: 200px;
  overflow: auto;
  font-family: var(--vscode-editor-font-family, 'Monaco', 'Courier New', monospace);
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--vscode-editor-foreground);
}

.button-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
}

.button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 8px 12px;
  font-size: 13px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-button-border);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  width: 100%;
}

.button:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.button.primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.button.primary:hover {
  background: var(--vscode-button-hoverBackground);
}

.shortcut-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  font-size: 11px;
  font-weight: 600;
  opacity: 0.7;
}

.reject-message-input {
  padding: 8px 12px;
  font-size: 13px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.reject-message-input:focus {
  border-color: var(--vscode-focusBorder);
}

.reject-message-input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}
</style>
