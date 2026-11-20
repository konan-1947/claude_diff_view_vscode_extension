<template>
  <DropdownTrigger
    align="left"
    :close-on-click-outside="true"
  >
    <template #trigger>
      <div class="model-dropdown">
        <div class="dropdown-content">
          <div class="dropdown-text">
            <span class="dropdown-label">{{ selectedModelLabel }}</span>
          </div>
        </div>
        <div class="codicon codicon-chevron-up chevron-icon text-[12px]!" />
      </div>
    </template>

    <template #content="{ close }">
      <DropdownItem
        v-for="(model, idx) in availableModels"
        :key="model.id"
        :item="{
          id: model.id,
          label: model.label,
          checked: selectedModel === model.id,
          type: 'model'
        }"
        :is-selected="selectedModel === model.id"
        :index="idx"
        @click="(item) => handleModelSelect(item, close)"
      />
    </template>
  </DropdownTrigger>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { DropdownTrigger, DropdownItem, type DropdownItemData } from './Dropdown'
import { transport } from '../core/runtimeTransport'

interface Props {
  selectedModel?: string
}

interface Emits {
  (e: 'modelSelect', modelId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  selectedModel: 'default'
})

const emit = defineEmits<Emits>()

// ── Data sources (all loaded via transport, no SettingsStore dependency) ──

interface CustomModel {
  id: string
  name?: string
}

interface SdkModel {
  value: string
  displayName: string
  description?: string
}

const sdkModels = ref<SdkModel[]>([])
const customModels = ref<CustomModel[]>([])
const disabledModels = ref<string[]>([])

onMounted(async () => {
  try {
    // Load extension config and SDK models in parallel
    const [configRes, sdkRes] = await Promise.all([
      transport.getExtensionConfig(),
      transport.sdkProbe(['supportedModels'], 10000).catch(() => null),
    ])

    if (configRes?.config) {
      customModels.value = configRes.config.customModels ?? []
      disabledModels.value = configRes.config.disabledModels ?? []
    }

    if (sdkRes?.data?.supportedModels) {
      // Filter out the 'Custom model' pseudo-entry from SDK results
      sdkModels.value = sdkRes.data.supportedModels.filter(
        (m: SdkModel) => m.description !== 'Custom model'
      )
    }
  } catch (e) {
    console.error('Failed to load model config:', e)
  }
})

// ── Listen for config changes from settings page ──

const unsubConfigChanged = transport.extensionConfigChanged.add(({ key, value }) => {
  if (key === 'customModels') {
    customModels.value = value ?? []
  } else if (key === 'disabledModels') {
    disabledModels.value = value ?? []
  }
})

onUnmounted(() => {
  unsubConfigChanged()
})

// ── Static aliases ──

const MODEL_ALIASES: Array<{ id: string; label: string }> = [
  { id: 'default', label: 'Default' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'opus', label: 'Opus' },
  { id: 'haiku', label: 'Haiku' },
]

// ── Available models: aliases + SDK + custom, minus disabled ──

const availableModels = computed(() => {
  const disabledSet = new Set(disabledModels.value)
  const seenIds = new Set<string>()
  const result: Array<{ id: string; label: string }> = []

  // 1. Static aliases
  for (const alias of MODEL_ALIASES) {
    if (!disabledSet.has(alias.id)) {
      result.push(alias)
      seenIds.add(alias.id)
    }
  }

  // 2. SDK probed models
  for (const m of sdkModels.value) {
    if (!seenIds.has(m.value) && !disabledSet.has(m.value)) {
      const cleanLabel = m.displayName.replace(/\s*\(recommended\)\s*$/i, '')
      result.push({ id: m.value, label: cleanLabel })
      seenIds.add(m.value)
    }
  }

  // 3. Custom models
  for (const cm of customModels.value) {
    if (!seenIds.has(cm.id) && !disabledSet.has(cm.id)) {
      result.push({ id: cm.id, label: cm.name || cm.id })
      seenIds.add(cm.id)
    }
  }

  return result
})

// ── Label for trigger display ──

const selectedModelLabel = computed(() => {
  const found = availableModels.value.find((m) => m.id === props.selectedModel)
  if (found) return found.label

  // Fallback: check all sources even if disabled
  const alias = MODEL_ALIASES.find((a) => a.id === props.selectedModel)
  if (alias) return alias.label

  const sdk = sdkModels.value.find((m) => m.value === props.selectedModel)
  if (sdk) return sdk.displayName.replace(/\s*\(recommended\)\s*$/i, '')

  const custom = customModels.value.find((m) => m.id === props.selectedModel)
  if (custom) return custom.name || custom.id

  // Last resort: show raw id
  return props.selectedModel || 'Select model'
})

function handleModelSelect(item: DropdownItemData, close: () => void) {
  close()
  emit('modelSelect', item.id)
}
</script>

<style scoped>
/* Model dropdown style - simple transparent style */
.model-dropdown {
  display: flex;
  gap: 4px;
  font-size: 12px;
  align-items: center;
  line-height: 24px;
  min-width: 0;
  max-width: 100%;
  padding: 2.5px 6px;
  border-radius: 23px;
  flex-shrink: 1;
  cursor: pointer;
  border: none;
  background: transparent;
  overflow: hidden;
  transition: background-color 0.2s ease;
  user-select: none;
}

.model-dropdown:hover {
  background-color: var(--vscode-inputOption-hoverBackground);
}

/* Shared Dropdown styles */
.dropdown-content {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.dropdown-text {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 12px;
  display: flex;
  align-items: baseline;
  gap: 3px;
  height: 13px;
  font-weight: 400;
}

.dropdown-label {
  opacity: 0.8;
  max-width: 120px;
  overflow: hidden;
  height: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.chevron-icon {
  font-size: 9px;
  flex-shrink: 0;
  opacity: 0.5;
  color: var(--vscode-foreground);
}
</style>
