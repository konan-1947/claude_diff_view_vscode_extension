<template>
  <SettingsTab title="MCP Servers">
    <!-- Section 1: Server Status (SDK probe, read-only) -->
    <SettingsSection title="Server Status">
      <SettingsSubSection>
        <!-- Loading state -->
        <SettingsCell v-if="loading">
          <template #label>
            <div class="mcp-loading">
              <span class="codicon codicon-loading mcp-spin" />
              <span>Probing MCP servers...</span>
            </div>
          </template>
        </SettingsCell>

        <!-- Server list -->
        <SettingsCell
          v-for="(server, index) in mcpServers"
          :key="server.name"
          :divider="index > 0"
        >
          <template #label>
            <div class="mcp-server-row">
              <span class="mcp-server-name">{{ server.name }}</span>
              <Badge :variant="statusVariant(server.status)" size="small">
                {{ statusLabel(server.status) }}
              </Badge>
            </div>
          </template>
          <template #trailing>
            <span v-if="server.serverInfo" class="mcp-server-version">
              {{ server.serverInfo.name }} v{{ server.serverInfo.version }}
            </span>
          </template>
        </SettingsCell>

        <!-- Empty state -->
        <SettingsCell v-if="!loading && mcpServers.length === 0">
          <template #label>
            <span class="mcp-empty">No MCP servers configured</span>
          </template>
        </SettingsCell>

        <!-- Action buttons -->
        <SettingsCell :divider="mcpServers.length > 0 || loading">
          <template #label>
            <div class="mcp-actions">
              <Tooltip content="Re-probe MCP servers">
                <button class="mcp-action-btn" :disabled="loading" @click="handleRefresh">
                  <span class="codicon codicon-refresh" :class="{ 'mcp-spin': loading }" />
                  <span>Refresh</span>
                </button>
              </Tooltip>
              <Tooltip content="Open ~/.claude.json (global MCP config)">
                <button class="mcp-action-btn" @click="openGlobalConfig">
                  <span class="codicon codicon-globe" />
                  <span>Global Config</span>
                </button>
              </Tooltip>
              <Tooltip content="Open .mcp.json (project MCP config)">
                <button class="mcp-action-btn" :disabled="!hasWorkspace" @click="openProjectConfig">
                  <span class="codicon codicon-folder" />
                  <span>Project Config</span>
                </button>
              </Tooltip>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Section 2: Project Server Policy -->
    <SettingsSection title="Project Server Policy">
      <SettingsSubSection caption="Control which MCP servers from .mcp.json files are automatically approved.">
        <!-- enableAllProjectMcpServers -->
        <SettingsItem
          setting-key="enableAllProjectMcpServers"
          label="Auto-Approve All Project Servers"
          description="Automatically approve all MCP servers defined in .mcp.json"
        >
          <template #default="{ effectiveValue, update }">
            <div class="cursor-settings-cell-switch-container">
              <span class="switch-tooltip-wrapper">
                <Switch
                  :model-value="effectiveValue ?? false"
                  @update:model-value="update"
                />
              </span>
            </div>
          </template>
        </SettingsItem>

        <!-- enabledMcpjsonServers -->
        <SettingsItem
          setting-key="enabledMcpjsonServers"
          label="Approved Servers"
          description="Explicitly approved MCP servers from .mcp.json"
          :divider="true"
        >
          <template #content="{ effectiveValue, update }">
            <div class="mcp-pill-container">
              <div
                v-for="(name, index) in (effectiveValue || [])"
                :key="'enabled-' + index"
                class="mcp-pill mcp-pill--enabled"
              >
                <span>{{ name }}</span>
                <button class="mcp-pill-remove" @click="update(removeFromArray(effectiveValue, Number(index)))">
                  <span class="codicon codicon-close" />
                </button>
              </div>
              <TextInput
                v-model="newEnabledServer"
                placeholder="Server name..."
                size="small"
                monospace
                class="mcp-pill-input"
                @keydown.enter.prevent="handleAddEnabled(effectiveValue, update)"
              />
            </div>
          </template>
        </SettingsItem>

        <!-- disabledMcpjsonServers -->
        <SettingsItem
          setting-key="disabledMcpjsonServers"
          label="Rejected Servers"
          description="Explicitly rejected MCP servers from .mcp.json"
          :divider="true"
        >
          <template #content="{ effectiveValue, update }">
            <div class="mcp-pill-container">
              <div
                v-for="(name, index) in (effectiveValue || [])"
                :key="'disabled-' + index"
                class="mcp-pill mcp-pill--disabled"
              >
                <span>{{ name }}</span>
                <button class="mcp-pill-remove" @click="update(removeFromArray(effectiveValue, Number(index)))">
                  <span class="codicon codicon-close" />
                </button>
              </div>
              <TextInput
                v-model="newDisabledServer"
                placeholder="Server name..."
                size="small"
                monospace
                class="mcp-pill-input"
                @keydown.enter.prevent="handleAddDisabled(effectiveValue, update)"
              />
            </div>
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Section 3: Enterprise Policy (conditional) -->
    <SettingsSection v-if="hasEnterprisePolicies" title="Enterprise Policy">
      <SettingsSubSection>
        <SettingsCell v-if="managedAllowedServers.length" label="Allowed Servers">
          <template #label>
            <div class="flex items-center gap-2">
              <span>Allowed Servers</span>
              <Tooltip content="Controlled by managed policy">
                <Badge variant="danger">Managed</Badge>
              </Tooltip>
            </div>
          </template>
          <template #bottom>
            <div class="mcp-pill-container">
              <div
                v-for="(server, index) in managedAllowedServers"
                :key="'ma-' + index"
                class="mcp-pill mcp-pill--enabled mcp-pill--readonly"
              >
                <span>{{ server.serverName }}</span>
              </div>
            </div>
          </template>
        </SettingsCell>

        <SettingsCell
          v-if="managedDeniedServers.length"
          label="Denied Servers"
          :divider="managedAllowedServers.length > 0"
        >
          <template #label>
            <div class="flex items-center gap-2">
              <span>Denied Servers</span>
              <Tooltip content="Controlled by managed policy">
                <Badge variant="danger">Managed</Badge>
              </Tooltip>
            </div>
          </template>
          <template #bottom>
            <div class="mcp-pill-container">
              <div
                v-for="(server, index) in managedDeniedServers"
                :key="'md-' + index"
                class="mcp-pill mcp-pill--disabled mcp-pill--readonly"
              >
                <span>{{ server.serverName }}</span>
              </div>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Section 4: MCP Environment Variables -->
    <SettingsSection title="MCP Environment Variables">
      <SettingsSubSection caption="Environment variables for MCP server configuration. Written to the env object in settings.json.">
        <SettingsCell
          v-for="(field, index) in MCP_ENV_FIELDS"
          :key="field.key"
          :description="field.description"
          :divider="index > 0"
          :class="{ 'mcp-inherited-cell': isEnvInherited(field.key) }"
        >
          <template #label>
            <div class="flex items-center gap-2">
              <span>{{ field.label }}</span>
              <Tooltip v-if="isEnvInherited(field.key)" content="Inherited from a lower-priority scope">
                <Badge variant="subtle">inherited</Badge>
              </Tooltip>
            </div>
          </template>
          <template #trailing>
            <TextInput
              v-model="fieldValues[field.key]"
              :type="field.type || 'text'"
              :placeholder="field.placeholder"
              monospace
              @change="updateEnvVar(field.key, $event)"
            />
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watchEffect } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import SettingsItem from '../SettingsItem.vue';
import Badge from '../../Common/Badge.vue';
import Switch from '../../Common/Switch.vue';
import TextInput from '../../Common/TextInput.vue';
import Tooltip from '../../Common/Tooltip.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';
import { useSettingsScope } from '../../../composables/useSettingsScope';
import { transport } from '../../../core/runtimeTransport';

const {
  settings, activeProfile, inspect, updateSetting,
  sdkCapabilities, sdkCapabilitiesLoading, refreshSdkCapabilities,
  hasWorkspace
} = useSettingsStore();
const scope = useSettingsScope();

// ── Server Status (SDK probe, read-only) ──

const mcpServers = computed(() => sdkCapabilities.value.mcpServerStatus || []);
const loading = computed(() => sdkCapabilitiesLoading.value);

type BadgeVariant = 'success' | 'danger' | 'warning' | 'subtle' | 'default';

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'connected': return 'success';
    case 'failed': return 'danger';
    case 'needs-auth': return 'warning';
    case 'pending': return 'subtle';
    default: return 'default';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'connected': return 'Connected';
    case 'failed': return 'Failed';
    case 'needs-auth': return 'Needs Auth';
    case 'pending': return 'Pending';
    default: return status;
  }
}

const handleRefresh = () => refreshSdkCapabilities();

// ── Config File Opening ──

const openGlobalConfig = () => transport.openConfigFile('mcp-global');
const openProjectConfig = () => transport.openConfigFile('mcp-project');

// ── Policy: Pill list helpers ──

const newEnabledServer = ref('');
const newDisabledServer = ref('');

function removeFromArray(arr: string[] | undefined, index: number): string[] {
  const list = [...(arr || [])];
  list.splice(index, 1);
  return list;
}

function addToArray(arr: string[] | undefined, item: string): string[] | undefined {
  const trimmed = item.trim();
  if (!trimmed) return arr;
  const list = [...(arr || [])];
  if (list.includes(trimmed)) return arr;
  list.push(trimmed);
  return list;
}

function handleAddEnabled(currentValue: string[] | undefined, update: (val: any) => void) {
  const result = addToArray(currentValue, newEnabledServer.value);
  if (result !== currentValue) {
    update(result);
    newEnabledServer.value = '';
  }
}

function handleAddDisabled(currentValue: string[] | undefined, update: (val: any) => void) {
  const result = addToArray(currentValue, newDisabledServer.value);
  if (result !== currentValue) {
    update(result);
    newDisabledServer.value = '';
  }
}

// ── Enterprise Policy (managed scope, read-only) ──

const hasEnterprisePolicies = computed(() => {
  void settings.value;
  const allowedMeta = inspect('allowedMcpServers');
  const deniedMeta = inspect('deniedMcpServers');
  return (allowedMeta?.values?.managed !== undefined)
    || (deniedMeta?.values?.managed !== undefined);
});

const managedAllowedServers = computed(() => {
  void settings.value;
  const meta = inspect('allowedMcpServers');
  return (meta?.values?.managed || []) as Array<{ serverName: string }>;
});

const managedDeniedServers = computed(() => {
  void settings.value;
  const meta = inspect('deniedMcpServers');
  return (meta?.values?.managed || []) as Array<{ serverName: string }>;
});

// ── MCP Environment Variables (Network Tab pattern) ──

interface McpEnvField {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  type?: 'text' | 'password';
}

const MCP_ENV_FIELDS: McpEnvField[] = [
  { key: 'MCP_TIMEOUT', label: 'Server Timeout', description: 'Timeout for MCP server startup (ms)', placeholder: '10000' },
  { key: 'MCP_TOOL_TIMEOUT', label: 'Tool Timeout', description: 'Timeout for individual MCP tool calls (ms)', placeholder: '300000' },
  { key: 'MAX_MCP_OUTPUT_TOKENS', label: 'Max Output Tokens', description: 'Maximum tokens in MCP server response (default 25000)', placeholder: '25000' },
  { key: 'ENABLE_TOOL_SEARCH', label: 'Tool Search', description: 'Enable tool search: auto, auto:N, true, or false', placeholder: 'auto' },
  { key: 'MCP_OAUTH_CALLBACK_PORT', label: 'OAuth Callback Port', description: 'Fixed port for MCP OAuth redirect', placeholder: '8080' },
  { key: 'MCP_CLIENT_SECRET', label: 'Client Secret', description: 'OAuth client secret for MCP authentication', placeholder: '••••••', type: 'password' },
];

const MCP_ENV_KEYS = MCP_ENV_FIELDS.map(f => f.key);

// Scope-aware env (same pattern as Network Tab)
const scopeEnv = computed<Record<string, string>>(() => {
  void settings.value;
  const meta = inspect('env');
  const values = meta?.values || {};
  if (activeProfile.value && scope.value === 'global') {
    return (values.profile as Record<string, string>) || {};
  }
  return (values[scope.value] as Record<string, string>) || {};
});

const effectiveEnv = computed<Record<string, string>>(() => {
  const val = settings.value?.env;
  return (val && typeof val === 'object' ? val : {}) as Record<string, string>;
});

const fieldValues = reactive<Record<string, string>>({});

watchEffect(() => {
  const env = effectiveEnv.value;
  for (const key of MCP_ENV_KEYS) {
    fieldValues[key] = env[key] || '';
  }
});

function isEnvInherited(key: string): boolean {
  return !!effectiveEnv.value[key] && !(key in scopeEnv.value);
}

function updateEnvVar(key: string, value: string) {
  const env: Record<string, string> = { ...scopeEnv.value };
  if (value) {
    env[key] = value;
  } else {
    delete env[key];
  }
  updateSetting('env', env, scope.value);
}
</script>

<style scoped>
/* ── Server Status ── */

.mcp-server-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mcp-server-name {
  font-family: var(--vscode-editor-font-family), monospace;
  font-size: 12px;
  color: var(--cursor-text-primary);
}

.mcp-server-version {
  font-size: 11px;
  color: var(--cursor-text-tertiary);
  font-family: var(--vscode-editor-font-family), monospace;
}

.mcp-loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--cursor-text-secondary);
  font-size: 12px;
}

.mcp-empty {
  color: var(--cursor-text-tertiary);
  font-size: 12px;
  font-style: italic;
}

/* ── Actions ── */

.mcp-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mcp-action-btn {
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--cursor-text-secondary);
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
  user-select: none;
}

.mcp-action-btn:hover:not(:disabled) {
  background-color: var(--cursor-bg-secondary);
  color: var(--cursor-text-primary);
}

.mcp-action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.mcp-action-btn .codicon {
  font-size: 13px;
}

/* ── Pill containers ── */

.mcp-pill-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  align-items: center;
}

.mcp-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: var(--vscode-editor-font-family), monospace;
  user-select: none;
  line-height: 1.5;
}

.mcp-pill--enabled {
  background-color: color-mix(in srgb, var(--cursor-text-green-primary) 12%, transparent);
  color: var(--cursor-text-green-primary);
}

.mcp-pill--disabled {
  background-color: color-mix(in srgb, var(--cursor-text-red-primary) 12%, transparent);
  color: var(--cursor-text-red-primary);
}

.mcp-pill--readonly {
  opacity: 0.7;
}

.mcp-pill-remove {
  all: unset;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.mcp-pill-remove:hover {
  opacity: 1;
}

.mcp-pill-remove .codicon {
  font-size: 12px;
}

.mcp-pill-input {
  min-width: 140px;
  max-width: 200px;
  flex-shrink: 0;
}

/* ── Spinner ── */

.mcp-spin {
  animation: mcp-spin 1s linear infinite;
}

@keyframes mcp-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Inherited ── */

.mcp-inherited-cell {
  opacity: 0.7;
}

/* ── Switch wrapper (isolate Tooltip as-child from Switch data-state) ── */

.switch-tooltip-wrapper {
  display: inline-flex;
  align-items: center;
}
</style>
