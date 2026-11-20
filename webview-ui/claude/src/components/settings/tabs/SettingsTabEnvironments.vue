<template>
  <SettingsTab title="Environments">
    <SettingsSection title="Environment Variables">
      <SettingsSubSection caption="Custom environment variables passed to Claude Code at launch. Variables managed by other tabs (Models, Network, Sandbox, etc.) are excluded here.">
        <!-- Table Header -->
        <SettingsCell>
          <template #label>
            <div class="env-table-header">
              <span class="env-col-key">Variable</span>
              <span class="env-col-value">Value</span>
              <span class="env-col-actions"></span>
            </div>
          </template>
        </SettingsCell>

        <!-- Scope-level entries (editable) -->
        <SettingsCell
          v-for="entry in scopeEntries"
          :key="'scope-' + entry.key"
          :divider="true"
        >
          <template #label>
            <div class="env-row">
              <!-- Key display -->
              <div class="env-col-key">
                <span class="env-key-text">{{ entry.key }}</span>
                <Tooltip v-if="isOverriddenByHigherScope(entry.key)" :content="`Overridden by ${overriddenByLabel(entry.key)} scope`">
                  <Badge variant="warning">overridden</Badge>
                </Tooltip>
              </div>

              <!-- Value display / edit -->
              <div class="env-col-value">
                <template v-if="editingKey === entry.key">
                  <TextInput
                    ref="editValueInputRef"
                    :model-value="editValue"
                    @update:model-value="editValue = $event"
                    monospace
                    size="small"
                    class="env-value-input"
                    placeholder="value"
                    @keydown.enter.prevent="commitEdit(entry.key)"
                    @keydown.escape.prevent="cancelEdit"
                  />
                </template>
                <template v-else>
                  <span
                    class="env-value-text"
                    :title="entry.value"
                    @dblclick="startEdit(entry.key, entry.value)"
                  >
                    {{ entry.value }}
                  </span>
                </template>
              </div>

              <!-- Actions -->
              <div class="env-col-actions">
                <template v-if="editingKey === entry.key">
                  <Tooltip content="Save">
                    <button class="env-action-btn" @click="commitEdit(entry.key)">
                      <span class="codicon codicon-check" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Cancel">
                    <button class="env-action-btn" @click="cancelEdit">
                      <span class="codicon codicon-close" />
                    </button>
                  </Tooltip>
                </template>
                <template v-else>
                  <Tooltip content="Edit value">
                    <button class="env-action-btn" @click="startEdit(entry.key, entry.value)">
                      <span class="codicon codicon-edit" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Remove from this scope">
                    <button class="env-action-btn env-action-btn-danger" @click="removeEnvVar(entry.key)">
                      <span class="codicon codicon-trash" />
                    </button>
                  </Tooltip>
                </template>
              </div>
            </div>
          </template>
        </SettingsCell>

        <!-- Inherited entries (read-only, can override) -->
        <SettingsCell
          v-for="entry in inheritedEntries"
          :key="'inherited-' + entry.key"
          :divider="true"
          class="env-inherited-cell"
        >
          <template #label>
            <div class="env-row env-row-inherited">
              <div class="env-col-key">
                <span class="env-key-text">{{ entry.key }}</span>
                <Tooltip content="Inherited from a lower-priority scope">
                  <Badge variant="subtle">inherited</Badge>
                </Tooltip>
              </div>
              <div class="env-col-value">
                <span class="env-value-text env-value-inherited" :title="entry.value">
                  {{ entry.value }}
                </span>
              </div>
              <div class="env-col-actions">
                <Tooltip content="Override in this scope">
                  <button class="env-action-btn" @click="overrideEnvVar(entry.key, entry.value)">
                    <span class="codicon codicon-arrow-up" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </template>
        </SettingsCell>

        <!-- Empty state -->
        <SettingsCell
          v-if="scopeEntries.length === 0 && inheritedEntries.length === 0"
          :divider="true"
        >
          <template #label>
            <span class="env-empty-text">No environment variables set.</span>
          </template>
        </SettingsCell>

        <!-- Add new variable row -->
        <SettingsCell :divider="true">
          <template #label>
            <div class="env-row">
              <!-- Key: Combobox autocomplete -->
              <div class="env-col-key">
                <ComboboxRoot
                  v-model="newKeySelected"
                  v-model:open="comboboxOpen"
                  :ignore-filter="true"
                  class="env-combobox-root"
                  @update:model-value="onComboboxSelect"
                >
                  <ComboboxAnchor class="env-combobox-anchor">
                    <ComboboxInput
                      v-model="newKeySearch"
                      class="env-combobox-input"
                      placeholder="VARIABLE_NAME"
                      @keydown.enter.prevent="handleKeyEnter"
                      @keydown.tab.prevent="focusNewValue"
                    />
                    <ComboboxTrigger class="env-combobox-trigger">
                      <span class="codicon codicon-chevron-down" />
                    </ComboboxTrigger>
                  </ComboboxAnchor>

                  <ComboboxPortal>
                    <ComboboxContent
                      class="env-combobox-content"
                      position="popper"
                      :side-offset="4"
                      side="bottom"
                      align="start"
                    >
                      <ComboboxViewport class="env-combobox-viewport">
                        <ComboboxItem
                          v-for="suggestion in filteredSuggestions"
                          :key="suggestion.key"
                          :value="suggestion.key"
                          class="env-combobox-item"
                        >
                          <div class="env-suggestion-row">
                            <span class="env-suggestion-key">{{ suggestion.key }}</span>
                            <span v-if="suggestion.description" class="env-suggestion-desc">{{ suggestion.description }}</span>
                          </div>
                        </ComboboxItem>
                        <ComboboxEmpty class="env-combobox-empty">
                          <span v-if="newKeySearch.trim()">Press Enter to use "{{ newKeySearch.trim() }}"</span>
                          <span v-else>Type to search known variables...</span>
                        </ComboboxEmpty>
                      </ComboboxViewport>
                    </ComboboxContent>
                  </ComboboxPortal>
                </ComboboxRoot>
              </div>

              <!-- Value -->
              <div class="env-col-value">
                <TextInput
                  ref="newValueInputRef"
                  v-model="newValue"
                  monospace
                  size="small"
                  class="env-value-input"
                  placeholder="value"
                  @keydown.enter.prevent="addEnvVar"
                />
              </div>

              <!-- Actions -->
              <div class="env-col-actions">
                <Tooltip content="Add variable">
                  <button
                    class="env-action-btn env-action-btn-add"
                    :disabled="!newKeySearch.trim()"
                    @click="addEnvVar"
                  >
                    <span class="codicon codicon-add" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Reset all button -->
    <div v-if="hasScopeEntries" class="env-reset-section">
      <Button variant="tertiary" size="small" @click="resetAllEnvVars">
        <span class="codicon codicon-discard" />
        Reset all env vars at this scope
      </Button>
    </div>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxContent,
  ComboboxViewport,
  ComboboxItem,
  ComboboxEmpty,
} from 'reka-ui'
import SettingsTab from '../SettingsTab.vue'
import SettingsSection from '../SettingsSection.vue'
import SettingsSubSection from '../SettingsSubSection.vue'
import SettingsCell from '../SettingsCell.vue'
import Badge from '../../Common/Badge.vue'
import Button from '../../Common/Button.vue'
import TextInput from '../../Common/TextInput.vue'
import Tooltip from '../../Common/Tooltip.vue'
import { useSettingsStore } from '../../../composables/useSettingsStore'
import { useSettingsScope } from '../../../composables/useSettingsScope'

const { settings, activeProfile, inspect, updateSetting, resetSetting } = useSettingsStore()
const scope = useSettingsScope()

// ── Claimed env keys (managed by other tabs) ──

const CLAIMED_ENV_KEYS = new Set([
  // Models Tab
  'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_EFFORT_LEVEL',
  'MAX_THINKING_TOKENS', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS',
  // Network Tab
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'CLAUDE_CODE_CLIENT_CERT',
  'CLAUDE_CODE_CLIENT_KEY', 'CLAUDE_CODE_CLIENT_KEY_PASSPHRASE', 'CLAUDE_CODE_PROXY_RESOLVES_HOSTS',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_SKIP_BEDROCK_AUTH', 'AWS_BEARER_TOKEN_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_SKIP_VERTEX_AUTH',
  'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_SKIP_FOUNDRY_AUTH',
  'ANTHROPIC_FOUNDRY_API_KEY', 'ANTHROPIC_FOUNDRY_BASE_URL', 'ANTHROPIC_FOUNDRY_RESOURCE',
  // Sandbox Tab
  'CLAUDE_CODE_SHELL', 'CLAUDE_CODE_SHELL_PREFIX', 'CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR',
  'BASH_DEFAULT_TIMEOUT_MS', 'BASH_MAX_TIMEOUT_MS', 'BASH_MAX_OUTPUT_LENGTH',
  // MCP Tab (reserved)
  'MCP_TIMEOUT', 'MCP_TOOL_TIMEOUT', 'MCP_CLIENT_SECRET',
  'MCP_OAUTH_CALLBACK_PORT', 'MAX_MCP_OUTPUT_TOKENS', 'ENABLE_TOOL_SEARCH',
])

// ── Known env var suggestions (unclaimed, available for this tab) ──

interface EnvSuggestion {
  key: string
  description: string
}

const KNOWN_ENV_VARS: EnvSuggestion[] = [
  // Authentication
  { key: 'ANTHROPIC_API_KEY', description: 'API key for Anthropic services' },
  { key: 'ANTHROPIC_AUTH_TOKEN', description: 'Auth token for Anthropic' },
  { key: 'ANTHROPIC_CUSTOM_HEADERS', description: 'Custom HTTP headers for API requests' },
  // Telemetry & Reporting
  { key: 'CLAUDE_CODE_ENABLE_TELEMETRY', description: 'Enable OpenTelemetry' },
  { key: 'DISABLE_TELEMETRY', description: 'Disable Statsig telemetry' },
  { key: 'DISABLE_ERROR_REPORTING', description: 'Disable Sentry error reporting' },
  { key: 'CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY', description: 'Disable session quality survey' },
  { key: 'DISABLE_COST_WARNINGS', description: 'Disable cost warnings' },
  { key: 'OTEL_METRICS_EXPORTER', description: 'OTel metrics exporter' },
  // Features
  { key: 'CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION', description: 'Enable prompt suggestions' },
  { key: 'CLAUDE_CODE_ENABLE_TASKS', description: 'Enable task list feature' },
  { key: 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', description: 'Disable auto memory' },
  { key: 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', description: 'Disable background tasks' },
  { key: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', description: 'Disable all non-essential traffic' },
  { key: 'DISABLE_AUTOUPDATER', description: 'Disable auto-updater' },
  { key: 'DISABLE_PROMPT_CACHING', description: 'Disable all prompt caching' },
  { key: 'DISABLE_PROMPT_CACHING_HAIKU', description: 'Disable Haiku prompt caching' },
  { key: 'DISABLE_PROMPT_CACHING_SONNET', description: 'Disable Sonnet prompt caching' },
  { key: 'DISABLE_PROMPT_CACHING_OPUS', description: 'Disable Opus prompt caching' },
  { key: 'DISABLE_NON_ESSENTIAL_MODEL_CALLS', description: 'Disable non-essential model calls' },
  // UI / Display
  { key: 'CLAUDE_CODE_HIDE_ACCOUNT_INFO', description: 'Hide account info display' },
  { key: 'CLAUDE_CODE_DISABLE_TERMINAL_TITLE', description: 'Disable terminal title updates' },
  // Execution
  { key: 'CLAUDE_CODE_EXIT_AFTER_STOP_DELAY', description: 'Delay before exit after stop (ms)' },
  { key: 'CLAUDE_CODE_TASK_LIST_ID', description: 'Custom task list ID' },
  { key: 'CLAUDE_CODE_TEAM_NAME', description: 'Team name for attribution' },
  { key: 'CLAUDE_CODE_API_KEY_HELPER_TTL_MS', description: 'TTL for API key helper cache (ms)' },
  { key: 'CLAUDE_CODE_AUTOCOMPACT_PCT_OVERRIDE', description: 'Override auto-compact threshold (%)' },
  // File & Storage
  { key: 'CLAUDE_CONFIG_DIR', description: 'Custom config/data directory' },
  { key: 'CLAUDE_CODE_TMPDIR', description: 'Override temp directory' },
  // Tools
  { key: 'USE_BUILTIN_RIPGREP', description: 'Use bundled ripgrep binary' },
  // Vertex region overrides
  { key: 'VERTEX_REGION', description: 'Default Vertex AI region' },
  { key: 'VERTEX_REGION_CLAUDE_3_5_SONNET', description: 'Vertex region for Sonnet 3.5' },
  { key: 'VERTEX_REGION_CLAUDE_3_5_HAIKU', description: 'Vertex region for Haiku 3.5' }
]

// ── Scope-aware reactive data ──

// Effective env across all scopes (merged result)
const effectiveEnv = computed<Record<string, string>>(() => {
  const val = settings.value.env
  return (val && typeof val === 'object' ? val : {}) as Record<string, string>
})

// Env at the current editing scope level only.
// When a profile is active and viewing User scope, we edit the profile layer (values.profile)
// rather than global (values.global = settings.json, the base layer).
const scopeEnv = computed<Record<string, string>>(() => {
  // Touch settings.value to establish Vue reactivity tracking
  // (inspect() reads alien-signals directly, which Vue cannot track)
  void settings.value
  const meta = inspect('env')
  const values = meta?.values || {}
  if (activeProfile.value && scope.value === 'global') {
    return (values.profile as Record<string, string>) || {}
  }
  return (values[scope.value] as Record<string, string>) || {}
})

// ── Computed entry lists ──

interface EnvEntry {
  key: string
  value: string
}

// Entries defined at the current scope (editable)
const scopeEntries = computed<EnvEntry[]>(() => {
  const env = scopeEnv.value
  return Object.keys(env)
    .filter(k => !CLAIMED_ENV_KEYS.has(k))
    .sort()
    .map(k => ({ key: k, value: env[k] }))
})

// Entries inherited from other scopes (read-only, can override)
const inheritedEntries = computed<EnvEntry[]>(() => {
  const effective = effectiveEnv.value
  const local = scopeEnv.value
  return Object.keys(effective)
    .filter(k => !CLAIMED_ENV_KEYS.has(k) && !(k in local))
    .sort()
    .map(k => ({ key: k, value: effective[k] }))
})

const hasScopeEntries = computed(() => scopeEntries.value.length > 0)

// Keys already set across all scopes (to exclude from suggestions)
const allSetKeys = computed(() => {
  const keys = new Set<string>()
  for (const k of Object.keys(effectiveEnv.value)) keys.add(k)
  return keys
})

// ── Combobox autocomplete ──

const newKeySearch = ref('')
const newKeySelected = ref<string>('')
const comboboxOpen = ref(false)

const filteredSuggestions = computed<EnvSuggestion[]>(() => {
  const query = newKeySearch.value.trim().toUpperCase()
  return KNOWN_ENV_VARS.filter(s => {
    // Exclude already-set keys
    if (allSetKeys.value.has(s.key)) return false
    // Match by query
    if (!query) return true
    return s.key.includes(query) || s.description.toUpperCase().includes(query)
  })
})

function onComboboxSelect(value: string) {
  if (value) {
    newKeySearch.value = value
    comboboxOpen.value = false
    nextTick(() => focusNewValue())
  }
}

function handleKeyEnter() {
  // If dropdown has highlighted item, let Combobox handle it.
  // Otherwise, treat as direct input and move to value field.
  if (!comboboxOpen.value || filteredSuggestions.value.length === 0) {
    focusNewValue()
  }
}

// ── Override detection ──

const SCOPE_MAP: Record<string, string> = {
  global: 'User',
  shared: 'Workspace',
  local: 'Local',
}

function isOverriddenByHigherScope(key: string): boolean {
  void settings.value
  const meta = inspect('env')
  const values = meta?.values || {}

  if (scope.value === 'global') {
    const localEnv = (values.local as Record<string, string>) || {}
    const sharedEnv = (values.shared as Record<string, string>) || {}
    if (key in localEnv) return true
    if (key in sharedEnv) return true
  } else if (scope.value === 'shared') {
    const localEnv = (values.local as Record<string, string>) || {}
    if (key in localEnv) return true
  }
  return false
}

function overriddenByLabel(key: string): string {
  void settings.value
  const meta = inspect('env')
  const values = meta?.values || {}

  if (scope.value === 'global') {
    const localEnv = (values.local as Record<string, string>) || {}
    if (key in localEnv) return SCOPE_MAP.local
    const sharedEnv = (values.shared as Record<string, string>) || {}
    if (key in sharedEnv) return SCOPE_MAP.shared
  } else if (scope.value === 'shared') {
    const localEnv = (values.local as Record<string, string>) || {}
    if (key in localEnv) return SCOPE_MAP.local
  }
  return ''
}

// ── CRUD operations (Read-Modify-Write) ──

const newValue = ref('')
const newValueInputRef = ref<InstanceType<typeof TextInput> | null>(null)

function focusNewValue() {
  nextTick(() => {
    if (newValueInputRef.value?.inputRef) {
      newValueInputRef.value.inputRef.focus()
    }
  })
}

function addEnvVar() {
  const key = newKeySearch.value.trim()
  if (!key) return
  const value = newValue.value

  const currentEnv = { ...scopeEnv.value }
  currentEnv[key] = value
  updateSetting('env', currentEnv, scope.value)

  newKeySearch.value = ''
  newKeySelected.value = ''
  newValue.value = ''
}

function removeEnvVar(key: string) {
  const currentEnv = { ...scopeEnv.value }
  delete currentEnv[key]
  updateSetting('env', currentEnv, scope.value)
}

function overrideEnvVar(key: string, value: string) {
  const currentEnv = { ...scopeEnv.value }
  currentEnv[key] = value
  updateSetting('env', currentEnv, scope.value)
}

function resetAllEnvVars() {
  resetSetting('env', scope.value)
}

// ── Inline editing ──

const editingKey = ref<string | null>(null)
const editValue = ref('')
const editValueInputRef = ref<InstanceType<typeof TextInput> | null>(null)

function startEdit(key: string, currentValue: string) {
  editingKey.value = key
  editValue.value = currentValue
  nextTick(() => {
    if (editValueInputRef.value?.inputRef) {
      editValueInputRef.value.inputRef.focus()
      editValueInputRef.value.inputRef.select()
    }
  })
}

function commitEdit(key: string) {
  const currentEnv = { ...scopeEnv.value }
  currentEnv[key] = editValue.value
  updateSetting('env', currentEnv, scope.value)
  editingKey.value = null
  editValue.value = ''
}

function cancelEdit() {
  editingKey.value = null
  editValue.value = ''
}
</script>

<style scoped>
/* ── Table layout (Name 2:1 Value) ── */

.env-table-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font-size: 11px;
  font-weight: 500;
  color: var(--cursor-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  user-select: none;
}

.env-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 24px;
}

.env-col-key {
  width: 0;
  flex-grow: 2;
  flex-shrink: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.env-col-value {
  width: 0;
  flex-grow: 1;
  flex-shrink: 1;
  min-width: 0;
}

.env-col-actions {
  width: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

/* ── Key/Value text ── */

.env-key-text {
  font-family: var(--vscode-editor-font-family), monospace;
  font-size: 12px;
  color: var(--cursor-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.env-value-text {
  font-family: var(--vscode-editor-font-family), monospace;
  font-size: 12px;
  color: var(--cursor-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  cursor: default;
  padding: 2px 4px;
  border-radius: 3px;
  transition: background-color 0.15s;
}

.env-value-text:hover {
  background-color: var(--cursor-bg-secondary);
}

.env-value-inherited {
  opacity: 0.6;
}

.env-value-input {
  width: 100%;
}

/* ── Inherited row styling ── */

.env-inherited-cell {
  opacity: 0.7;
}

.env-row-inherited .env-key-text {
  color: var(--cursor-text-secondary);
}

/* ── Action buttons ── */

.env-action-btn {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cursor-icon-tertiary);
  font-size: 13px;
  transition: color 0.15s, background-color 0.15s;
}

.env-action-btn:hover {
  background-color: var(--cursor-bg-secondary);
  color: var(--cursor-icon-primary);
}

.env-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.env-action-btn:disabled:hover {
  background-color: transparent;
  color: var(--cursor-icon-tertiary);
}

.env-action-btn-danger:hover {
  color: var(--cursor-text-red-primary, var(--vscode-errorForeground));
}

.env-action-btn-add {
  color: var(--cursor-icon-secondary);
}

.env-action-btn-add:hover:not(:disabled) {
  color: var(--cursor-icon-primary);
}

/* ── Combobox (use :deep for reka-ui rendered elements) ── */

.env-col-key :deep(.env-combobox-root) {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
}

.env-col-key :deep(.env-combobox-anchor) {
  display: flex;
  align-items: center;
  width: 100%;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  box-sizing: border-box;
}

.env-col-key :deep(.env-combobox-anchor):focus-within {
  border-color: var(--vscode-focusBorder);
}

.env-col-key :deep(.env-combobox-input) {
  flex: 1 1 0;
  min-width: 0;
  width: 100%;
  padding: 3px 6px;
  background: transparent;
  border: none;
  font-family: var(--vscode-editor-font-family), monospace;
  font-size: 12px;
  color: var(--vscode-input-foreground);
  outline: none;
  box-sizing: border-box;
  line-height: 1.4;
}

.env-col-key :deep(.env-combobox-input)::placeholder {
  color: var(--vscode-input-placeholderForeground);
}

.env-col-key :deep(.env-combobox-trigger) {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  cursor: pointer;
  color: var(--cursor-icon-tertiary);
  flex-shrink: 0;
}

.env-col-key :deep(.env-combobox-trigger):hover {
  color: var(--cursor-icon-primary);
}

.env-col-key :deep(.env-combobox-trigger) .codicon {
  font-size: 12px;
}
</style>

<style>
/* Combobox dropdown must NOT be scoped — rendered via Portal outside component DOM */

.env-combobox-content {
  background-color: var(--vscode-settings-dropdownBackground);
  border: 1px solid var(--vscode-settings-dropdownBorder);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
  width: var(--reka-combobox-trigger-width);
  min-width: 260px;
}

.env-combobox-viewport {
  max-height: 220px;
  overflow-y: auto;
  padding: 4px 0;
}

.env-combobox-item {
  display: flex;
  align-items: center;
  padding: 5px 10px;
  cursor: pointer;
  outline: none;
  user-select: none;
  transition: background-color 0.1s;
}

.env-combobox-item[data-highlighted] {
  background-color: var(--vscode-list-hoverBackground);
}

.env-combobox-item[data-disabled] {
  opacity: 0.4;
  pointer-events: none;
}

.env-suggestion-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.env-suggestion-key {
  font-family: var(--vscode-editor-font-family), monospace;
  font-size: 12px;
  color: var(--vscode-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.env-suggestion-desc {
  font-size: 11px;
  color: var(--cursor-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.env-combobox-empty {
  padding: 8px 10px;
  font-size: 11px;
  color: var(--cursor-text-tertiary);
  font-style: italic;
  text-align: center;
}
</style>
