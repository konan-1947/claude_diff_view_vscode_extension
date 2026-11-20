<template>
  <SettingsTab title="Permissions">
    <!-- Section 1: Default Mode -->
    <SettingsSection title="Default Mode">
      <SettingsSubSection>
        <SettingsCell
          label="Permission Mode"
          description="Default behavior when Claude requests permission for an operation"
          :class="{ 'perm-inherited-cell': isModeInherited }"
        >
          <template #label>
            <div class="flex items-center gap-2">
              <span>Permission Mode</span>
              <Tooltip v-if="isModeInherited" content="Inherited from a lower-priority scope">
                <Badge variant="subtle">inherited</Badge>
              </Tooltip>
              <Tooltip v-if="isModeOverridden" :content="`Overridden by ${modeOverriddenByLabel} scope`">
                <Badge variant="warning">overridden</Badge>
              </Tooltip>
            </div>
          </template>
          <template #trailing>
            <Dropdown
              :model-value="defaultMode"
              @update:model-value="updateDefaultMode"
              :options="defaultModeOptions"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || defaultMode }}
              </template>
            </Dropdown>
          </template>
        </SettingsCell>

        <!-- Managed: disableBypassPermissionsMode -->
        <SettingsCell
          v-if="bypassDisabledByManaged"
          label="Bypass Mode Disabled"
          description="The ability to bypass permission prompts has been disabled by managed policy"
          :divider="true"
        >
          <template #label>
            <div class="flex items-center gap-2">
              <span>Bypass Mode Disabled</span>
              <Tooltip content="Controlled by managed policy">
                <Badge variant="danger">Managed</Badge>
              </Tooltip>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Section 2: Permission Rules -->
    <SettingsSection title="Permission Rules">
      <SettingsSubSection caption="Evaluation order: Deny → Ask → Allow (first match wins). Rules use the format: ToolName or ToolName(pattern) or mcp__server__tool.">
        <!-- Deny Rules -->
        <SettingsCell label="Deny Rules" description="Operations that are always blocked">
          <template #label>
            <div class="flex items-center gap-2">
              <span>Deny Rules</span>
              <Tooltip v-if="isListInherited('deny')" content="Inherited from a lower-priority scope">
                <Badge variant="subtle">inherited</Badge>
              </Tooltip>
            </div>
          </template>
          <template #bottom>
            <div class="perm-rules-container">
              <!-- Scope rules (editable) -->
              <div
                v-for="(rule, index) in scopeDenyRules"
                :key="'deny-scope-' + index"
                class="perm-pill perm-pill--deny"
              >
                <span>{{ rule }}</span>
                <button class="perm-pill-remove" @click="removeScopeRule('deny', index)">
                  <span class="codicon codicon-close" />
                </button>
              </div>
              <!-- Inherited rules (read-only) -->
              <Tooltip v-for="(rule, index) in inheritedDenyRules" :key="'deny-inh-' + index" content="Inherited — remove from the source scope to change">
                <div class="perm-pill perm-pill--deny perm-pill--inherited">
                  <span>{{ rule }}</span>
                </div>
              </Tooltip>
              <!-- Add input -->
              <TextInput
                v-model="newDenyRule"
                placeholder="e.g. Bash(rm:*)"
                size="small"
                monospace
                class="perm-rule-input"
                @keydown.enter.prevent="addRule('deny', newDenyRule); newDenyRule = ''"
              />
            </div>
          </template>
        </SettingsCell>

        <!-- Ask Rules -->
        <SettingsCell label="Ask Rules" description="Operations that always require confirmation" :divider="true">
          <template #label>
            <div class="flex items-center gap-2">
              <span>Ask Rules</span>
              <Tooltip v-if="isListInherited('ask')" content="Inherited from a lower-priority scope">
                <Badge variant="subtle">inherited</Badge>
              </Tooltip>
            </div>
          </template>
          <template #bottom>
            <div class="perm-rules-container">
              <div
                v-for="(rule, index) in scopeAskRules"
                :key="'ask-scope-' + index"
                class="perm-pill perm-pill--ask"
              >
                <span>{{ rule }}</span>
                <button class="perm-pill-remove" @click="removeScopeRule('ask', index)">
                  <span class="codicon codicon-close" />
                </button>
              </div>
              <Tooltip v-for="(rule, index) in inheritedAskRules" :key="'ask-inh-' + index" content="Inherited — remove from the source scope to change">
                <div class="perm-pill perm-pill--ask perm-pill--inherited">
                  <span>{{ rule }}</span>
                </div>
              </Tooltip>
              <TextInput
                v-model="newAskRule"
                placeholder="e.g. Bash(git push:*)"
                size="small"
                monospace
                class="perm-rule-input"
                @keydown.enter.prevent="addRule('ask', newAskRule); newAskRule = ''"
              />
            </div>
          </template>
        </SettingsCell>

        <!-- Allow Rules -->
        <SettingsCell label="Allow Rules" description="Operations that are auto-approved" :divider="true">
          <template #label>
            <div class="flex items-center gap-2">
              <span>Allow Rules</span>
              <Tooltip v-if="isListInherited('allow')" content="Inherited from a lower-priority scope">
                <Badge variant="subtle">inherited</Badge>
              </Tooltip>
            </div>
          </template>
          <template #bottom>
            <div class="perm-rules-container">
              <div
                v-for="(rule, index) in scopeAllowRules"
                :key="'allow-scope-' + index"
                class="perm-pill perm-pill--allow"
              >
                <span>{{ rule }}</span>
                <button class="perm-pill-remove" @click="removeScopeRule('allow', index)">
                  <span class="codicon codicon-close" />
                </button>
              </div>
              <Tooltip v-for="(rule, index) in inheritedAllowRules" :key="'allow-inh-' + index" content="Inherited — remove from the source scope to change">
                <div class="perm-pill perm-pill--allow perm-pill--inherited">
                  <span>{{ rule }}</span>
                </div>
              </Tooltip>
              <TextInput
                v-model="newAllowRule"
                placeholder="e.g. Bash(npm run *)"
                size="small"
                monospace
                class="perm-rule-input"
                @keydown.enter.prevent="addRule('allow', newAllowRule); newAllowRule = ''"
              />
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Section 3: Additional Directories -->
    <SettingsSection title="Additional Directories">
      <SettingsSubSection caption="Extra directories to include in the permission scope, allowing Claude to access files outside the project root.">
        <SettingsCell label="Directories" description="Paths to additional allowed directories">
          <template #label>
            <div class="flex items-center gap-2">
              <span>Directories</span>
              <Tooltip v-if="isListInherited('additionalDirectories')" content="Inherited from a lower-priority scope">
                <Badge variant="subtle">inherited</Badge>
              </Tooltip>
            </div>
          </template>
          <template #bottom>
            <div class="perm-rules-container">
              <div
                v-for="(dir, index) in scopeAdditionalDirs"
                :key="'dir-scope-' + index"
                class="perm-pill perm-pill--dir"
              >
                <span>{{ dir }}</span>
                <button class="perm-pill-remove" @click="removeScopeDir(index)">
                  <span class="codicon codicon-close" />
                </button>
              </div>
              <Tooltip v-for="(dir, index) in inheritedAdditionalDirs" :key="'dir-inh-' + index" content="Inherited — remove from the source scope to change">
                <div class="perm-pill perm-pill--dir perm-pill--inherited">
                  <span>{{ dir }}</span>
                </div>
              </Tooltip>
              <TextInput
                v-model="newDir"
                placeholder="e.g. ~/docs, ../shared"
                size="small"
                monospace
                class="perm-rule-input"
                @keydown.enter.prevent="addDir"
              />
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import Badge from '../../Common/Badge.vue';
import Dropdown from '../../Common/Dropdown.vue';
import TextInput from '../../Common/TextInput.vue';
import Tooltip from '../../Common/Tooltip.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';
import { useSettingsScope } from '../../../composables/useSettingsScope';

const { settings, activeProfile, inspect, updateSetting } = useSettingsStore();
const scope = useSettingsScope();

// ── Types ──

interface PermissionsConfig {
  allow?: string[];
  deny?: string[];
  ask?: string[];
  defaultMode?: string;
  additionalDirectories?: string[];
  disableBypassPermissionsMode?: string;
}

// ── Scope-aware computed ──

// Permissions at the current editing scope only (profile layer when active)
const scopePermissions = computed<PermissionsConfig>(() => {
  void settings.value;
  const meta = inspect('permissions');
  const values = meta?.values || {};
  if (activeProfile.value && scope.value === 'global') {
    return (values.profile as PermissionsConfig) || {};
  }
  return (values[scope.value] as PermissionsConfig) || {};
});

// Effective permissions (merged from all layers)
const effectivePermissions = computed<PermissionsConfig>(() => {
  const val = settings.value?.permissions;
  return (val && typeof val === 'object' ? val : {}) as PermissionsConfig;
});

// ── Default Mode ──

const defaultModeOptions = [
  { label: 'Default', value: 'default', description: 'Prompts on first use' },
  { label: 'Accept Edits', value: 'acceptEdits', description: 'Auto-accept file edits' },
  { label: 'Plan', value: 'plan', description: 'Read-only, no modifications' },
  { label: 'Delegate', value: 'delegate', description: 'Coordination-only for agent teams' },
  { label: "Don't Ask", value: 'dontAsk', description: 'Auto-deny unless pre-approved' },
  { label: 'Bypass', value: 'bypassPermissions', description: 'Skip all prompts (isolated environments only)' },
];

const defaultMode = computed(() => effectivePermissions.value.defaultMode || 'default');

const isModeInherited = computed(() => {
  return scopePermissions.value.defaultMode === undefined
    && effectivePermissions.value.defaultMode !== undefined;
});

const isModeOverridden = computed(() => {
  void settings.value;
  const meta = inspect('permissions');
  const values = meta?.values || {};
  if (scope.value === 'global') {
    const local = values.local as PermissionsConfig | undefined;
    const shared = values.shared as PermissionsConfig | undefined;
    if (local?.defaultMode !== undefined) return true;
    if (shared?.defaultMode !== undefined) return true;
  } else if (scope.value === 'shared') {
    const local = values.local as PermissionsConfig | undefined;
    if (local?.defaultMode !== undefined) return true;
  }
  return false;
});

const SCOPE_MAP: Record<string, string> = { global: 'User', shared: 'Workspace', local: 'Local' };

const modeOverriddenByLabel = computed(() => {
  void settings.value;
  const meta = inspect('permissions');
  const values = meta?.values || {};
  if (scope.value === 'global') {
    if ((values.local as PermissionsConfig)?.defaultMode !== undefined) return SCOPE_MAP.local;
    if ((values.shared as PermissionsConfig)?.defaultMode !== undefined) return SCOPE_MAP.shared;
  } else if (scope.value === 'shared') {
    if ((values.local as PermissionsConfig)?.defaultMode !== undefined) return SCOPE_MAP.local;
  }
  return '';
});

function updateDefaultMode(val: string) {
  const current = { ...scopePermissions.value };
  if (val === 'default') {
    delete current.defaultMode;
  } else {
    current.defaultMode = val;
  }
  savePermissions(current);
}

// Managed: disableBypassPermissionsMode
const bypassDisabledByManaged = computed(() => {
  void settings.value;
  const meta = inspect('permissions');
  const managed = (meta?.values?.managed as PermissionsConfig) || {};
  return managed.disableBypassPermissionsMode === 'disable';
});

// ── Rule Lists (scope-separated) ──

// Rules that exist at the current editing scope (editable)
const scopeAllowRules = computed(() => scopePermissions.value.allow || []);
const scopeDenyRules = computed(() => scopePermissions.value.deny || []);
const scopeAskRules = computed(() => scopePermissions.value.ask || []);
const scopeAdditionalDirs = computed(() => scopePermissions.value.additionalDirectories || []);

// Rules that exist in the effective value but NOT in the current scope (inherited, read-only)
const inheritedAllowRules = computed(() => {
  const effective = effectivePermissions.value.allow || [];
  const scopeSet = new Set(scopeAllowRules.value);
  return effective.filter(r => !scopeSet.has(r));
});

const inheritedDenyRules = computed(() => {
  const effective = effectivePermissions.value.deny || [];
  const scopeSet = new Set(scopeDenyRules.value);
  return effective.filter(r => !scopeSet.has(r));
});

const inheritedAskRules = computed(() => {
  const effective = effectivePermissions.value.ask || [];
  const scopeSet = new Set(scopeAskRules.value);
  return effective.filter(r => !scopeSet.has(r));
});

const inheritedAdditionalDirs = computed(() => {
  const effective = effectivePermissions.value.additionalDirectories || [];
  const scopeSet = new Set(scopeAdditionalDirs.value);
  return effective.filter(d => !scopeSet.has(d));
});

// Inherited detection per list
function isListInherited(prop: 'allow' | 'deny' | 'ask' | 'additionalDirectories'): boolean {
  const scopeArr = scopePermissions.value[prop];
  const effectiveArr = effectivePermissions.value[prop];
  return (!scopeArr || scopeArr.length === 0) && !!effectiveArr && effectiveArr.length > 0;
}

// ── Input refs ──

const newAllowRule = ref('');
const newDenyRule = ref('');
const newAskRule = ref('');
const newDir = ref('');

// ── CRUD operations ──

function savePermissions(config: PermissionsConfig) {
  // Clean up: remove empty arrays and default values for delta-only writes
  const clean: PermissionsConfig = {};
  if (config.allow?.length) clean.allow = config.allow;
  if (config.deny?.length) clean.deny = config.deny;
  if (config.ask?.length) clean.ask = config.ask;
  if (config.defaultMode && config.defaultMode !== 'default') clean.defaultMode = config.defaultMode;
  if (config.additionalDirectories?.length) clean.additionalDirectories = config.additionalDirectories;
  if (config.disableBypassPermissionsMode) clean.disableBypassPermissionsMode = config.disableBypassPermissionsMode;

  updateSetting('permissions', Object.keys(clean).length ? clean : undefined, scope.value);
}

function addRule(type: 'allow' | 'deny' | 'ask', ruleRef: string) {
  const rule = ruleRef.trim();
  if (!rule) return;

  const current = { ...scopePermissions.value };
  const list = [...(current[type] || [])];
  if (list.includes(rule)) return;

  list.push(rule);
  current[type] = list;
  savePermissions(current);
}

function removeScopeRule(type: 'allow' | 'deny' | 'ask', index: number) {
  const current = { ...scopePermissions.value };
  const list = [...(current[type] || [])];
  list.splice(index, 1);
  current[type] = list;
  savePermissions(current);
}

function addDir() {
  const dir = newDir.value.trim();
  if (!dir) return;

  const current = { ...scopePermissions.value };
  const list = [...(current.additionalDirectories || [])];
  if (list.includes(dir)) return;

  list.push(dir);
  current.additionalDirectories = list;
  newDir.value = '';
  savePermissions(current);
}

function removeScopeDir(index: number) {
  const current = { ...scopePermissions.value };
  const list = [...(current.additionalDirectories || [])];
  list.splice(index, 1);
  current.additionalDirectories = list;
  savePermissions(current);
}
</script>

<style scoped>
/* ── Rule list container ── */

.perm-rules-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  align-items: center;
}

/* ── Pill base ── */

.perm-pill {
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

.perm-pill--inherited {
  opacity: 0.5;
  cursor: default;
}

/* ── Pill variants ── */

.perm-pill--deny {
  background-color: color-mix(in srgb, var(--cursor-text-red-primary) 12%, transparent);
  color: var(--cursor-text-red-primary);
}

.perm-pill--ask {
  background-color: color-mix(in srgb, var(--cursor-text-yellow-primary) 12%, transparent);
  color: var(--cursor-text-yellow-primary);
}

.perm-pill--allow {
  background-color: color-mix(in srgb, var(--cursor-text-green-primary) 12%, transparent);
  color: var(--cursor-text-green-primary);
}

.perm-pill--dir {
  background-color: var(--cursor-bg-tertiary);
  color: var(--cursor-text-primary);
}

/* ── Pill remove button ── */

.perm-pill-remove {
  all: unset;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.perm-pill-remove:hover {
  opacity: 1;
}

.perm-pill-remove .codicon {
  font-size: 12px;
}

/* ── Add rule input ── */

.perm-rule-input {
  min-width: 160px;
  max-width: 240px;
  flex-shrink: 0;
}

/* ── Inherited cell dimming ── */

.perm-inherited-cell {
  opacity: 0.7;
}
</style>
