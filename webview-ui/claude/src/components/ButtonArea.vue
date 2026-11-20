<template>
  <div class="button-area-container">
    <div class="button-row">
      <!-- Left Section: Dropdowns -->
      <div class="controls-section">
        <!-- Mode Select -->
        <ModeSelect
          :permission-mode="permissionMode"
          :modes="modes"
          @mode-select="(mode) => emit('modeSelect', mode)"
        />

        <!-- Model Select -->
        <ModelSelect
          :selected-model="selectedModel"
          @model-select="(modelId) => emit('modelSelect', modelId)"
        />

        <!-- Effort: only for models the CLI reports as supporting it -->
        <EffortSelect
          v-if="effortLevels.length > 0"
          :effort-level="effortLevel"
          :levels="effortLevels"
          @effort-select="(level) => emit('effortSelect', level)"
        />
      </div>

      <!-- Right Section: Token Indicator + Action Buttons -->
      <div class="actions-section">
        <!-- Token Indicator -->
        <TokenIndicator
          v-if="showProgress"
          :percentage="progressPercentage"
          :context-tooltip="contextTooltip"
        />

        <!-- Thinking Toggle Button: hidden on models that cannot turn thinking off -->
        <Tooltip v-if="showThinkingToggle" :content="isThinkingOn ? 'Thinking on' : 'Thinking off'">
          <button
            class="action-button think-button"
            :class="{ 'thinking-active': isThinkingOn }"
            @click="handleThinkingToggle"
          >
            <span class="codicon codicon-brain text-[16px]!" />
          </button>
        </Tooltip>

        <!-- Attach File Button -->
        <Tooltip content="Attach File">
          <button
            class="action-button"
            @click="handleAttachClick"
          >
            <span class="codicon codicon-attach text-[16px]!" />
            <input
              ref="fileInputRef"
              type="file"
              multiple
              style="display: none;"
              @change="handleFileUpload"
            >
          </button>
        </Tooltip>

        <!-- Submit Button -->
        <Tooltip :content="submitVariant === 'stop' ? 'Stop' : 'Send'">
          <button
            class="submit-button"
            @click="handleSubmit"
            :disabled="submitVariant === 'disabled'"
            :data-variant="submitVariant"
          >
            <span
              v-if="submitVariant === 'stop'"
              class="codicon codicon-debug-stop text-[12px]! bg-(--vscode-editor-background)e-[0.6] rounded-[1px]"
            />
            <span
              v-else
              class="codicon codicon-arrow-up-two text-[12px]!"
            />
          </button>
        </Tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import { ref, computed } from 'vue'
import Tooltip from './Common/Tooltip.vue'
import TokenIndicator from './TokenIndicator.vue'
import ModeSelect from './ModeSelect.vue'
import ModelSelect from './ModelSelect.vue'
import EffortSelect from './EffortSelect.vue'
import type { ModeOption } from '../utils/permissionModes'

interface Props {
  disabled?: boolean
  loading?: boolean
  selectedModel?: string
  conversationWorking?: boolean
  hasInputContent?: boolean
  showProgress?: boolean
  progressPercentage?: number
  contextTooltip?: string
  thinkingLevel?: string
  permissionMode?: PermissionMode
  modes?: ModeOption[]
  showThinkingToggle?: boolean
  effortLevel?: string
  effortLevels?: string[]
}

interface Emits {
  (e: 'submit'): void
  (e: 'stop'): void
  (e: 'attach'): void
  (e: 'addAttachment', files: FileList): void
  (e: 'mention', filePath?: string): void
  (e: 'thinkingToggle'): void
  (e: 'effortSelect', level: string): void
  (e: 'modeSelect', mode: PermissionMode): void
  (e: 'modelSelect', modelId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  loading: false,
  selectedModel: 'default',
  conversationWorking: false,
  hasInputContent: false,
  showProgress: true,
  progressPercentage: 48.7,
  contextTooltip: '',
  thinkingLevel: 'default_on',
  permissionMode: 'default',
  modes: () => [],
  showThinkingToggle: true,
  effortLevel: 'auto',
  effortLevels: () => []
})

const emit = defineEmits<Emits>()

const fileInputRef = ref<HTMLInputElement>()


const isThinkingOn = computed(() => props.thinkingLevel !== 'off')

const submitVariant = computed(() => {
  // Match React: always show the stop button while busy
  if (props.conversationWorking) {
    return 'stop'
  }

  // Not busy and no input -> disabled
  if (!props.hasInputContent) {
    return 'disabled'
  }

  // Otherwise -> can send
  return 'enabled'
})

function handleSubmit() {
  if (submitVariant.value === 'stop') {
    emit('stop')
  } else if (submitVariant.value === 'enabled') {
    emit('submit')
  }
}

function handleThinkingToggle() {
  emit('thinkingToggle')
}

function handleAttachClick() {
  fileInputRef.value?.click()
}

function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    emit('addAttachment', target.files)
    // Clear the input so the same file can be picked again
    target.value = ''
  }
}



</script>

<style scoped>
.button-area-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
  flex-shrink: 0;
  cursor: auto;
  width: 100%;
  user-select: none;
}

.button-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  height: 28px;
  padding-right: 2px;
  box-sizing: border-box;
  flex: 1 1 0%;
  justify-content: space-between;
  width: 100%;
}

.controls-section {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 6px;
  flex-shrink: 1;
  flex-grow: 0;
  min-width: 0;
  height: 20px;
  max-width: 100%;
}

.actions-section {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
}

.action-button,
.submit-button {
  opacity: 0.5;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color 0.2s ease, opacity 0.2s ease;
  color: var(--vscode-foreground);
  position: relative;
}


.action-button:hover:not(:disabled) {
  opacity: 1;
}

.action-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.action-button.thinking-active {
  color: var(--vscode-button-secondaryForeground);
  opacity: 1;
}

/* Think button only: cancel the hover opacity effect to avoid confusion in the off state */
.action-button.think-button:hover:not(.thinking-active) {
  opacity: 0.5; /* keep the default opacity, do not raise it to 1 */
}

/* hover can stay in the active state */
.action-button.think-button.thinking-active:hover {
  opacity: 1;
}

.submit-button {
  opacity: 1;
}

.submit-button[data-variant="enabled"] {
  background-color: var(--cs-fg-66);
  color: var(--vscode-editor-background);
  opacity: 1;
}

.submit-button[data-variant="disabled"] {
  background-color: var(--cs-fg-66);
  color: var(--vscode-editor-background);
  opacity: 0.4;
  cursor: not-allowed;
}

.submit-button[data-variant="stop"] {
  background-color: var(--cs-fg-66);
  color: var(--vscode-editor-background);
  opacity: 1;
}


.codicon-modifier-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
