<template>
  <SettingsCell :label="label" :description="description" :divider="divider" class="settings-item">
    <template #label-prefix>
      <slot name="label-prefix"></slot>
    </template>

    <template #label>
      <div class="flex items-center gap-2">
        <span>{{ label }}</span>

        <!-- Inherited badge (when current scope has no value) -->
        <Tooltip v-if="inherited && !isReadOnly" content="Inherited from a lower-priority scope">
          <Badge variant="subtle">inherited</Badge>
        </Tooltip>

        <!-- Override warning (when value is overridden by a higher-priority scope) -->
        <Tooltip v-if="overriddenBy && !isReadOnly" :content="`Overridden by ${overriddenByLabel} scope`">
          <Badge variant="warning">overridden</Badge>
        </Tooltip>

        <!-- Read-Only Badge (managed/cli) -->
        <Tooltip v-if="isReadOnly" content="Setting is managed by policy or CLI arguments">
          <Badge :variant="badgeVariant">{{ badgeLabel }}</Badge>
        </Tooltip>
      </div>
    </template>

    <template #description>
      <slot name="description"></slot>
    </template>

    <template #trailing>
      <div class="flex items-center gap-2">
        <slot
          :value="scopeValue"
          :display-value="displayValue"
          :effective-value="effectiveValue"
          :inherited="inherited"
          :overridden-by="overriddenBy"
          :update="onUpdate"
          :reset="onReset"
        ></slot>

        <!-- Reset button (only when current scope has an explicit value set) -->
        <Tooltip v-if="scopeValue !== undefined && !isReadOnly" content="Reset to default">
          <button
            class="settings-item-reset-btn"
            @click="onReset"
          >
            <span class="codicon codicon-discard" />
          </button>
        </Tooltip>
      </div>
    </template>

    <template #bottom>
      <slot
        name="content"
        :value="scopeValue"
        :display-value="displayValue"
        :effective-value="effectiveValue"
        :inherited="inherited"
        :overridden-by="overriddenBy"
        :update="onUpdate"
        :reset="onReset"
      ></slot>
    </template>
  </SettingsCell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SettingsCell from './SettingsCell.vue';
import Badge from '../Common/Badge.vue';
import Tooltip from '../Common/Tooltip.vue';
import { useSettingsStore } from '../../composables/useSettingsStore';
import { useSettingsScope } from '../../composables/useSettingsScope';

const props = defineProps<{
  settingKey: string;
  label?: string;
  description?: string;
  divider?: boolean;
}>();

const { settings, activeProfile, inspect, updateSetting, resetSetting } = useSettingsStore();
const scope = useSettingsScope();

// Touch `settings.value` to establish Vue reactivity tracking.
// `inspect()` internally reads alien-signals directly, which Vue cannot track.
// By reading the Vue-bridged `settings` ref first, we ensure this computed
// re-evaluates whenever the underlying _settings signal changes.
const meta = computed(() => {
  void settings.value;
  return inspect(props.settingKey);
});

// The effective value across all scopes (what CC will actually use)
const effectiveValue = computed(() => meta.value.value);
const effectiveScope = computed(() => meta.value.effectiveScope || 'default');

// Scope name mapping for display
const SCOPE_MAP: Record<string, string> = {
  global: 'User',
  shared: 'Workspace',
  local: 'Local'
};

// The value at the CURRENT editing scope (may be undefined if not set at this level).
// When a profile is active and viewing User scope, we edit the profile layer (values.profile)
// rather than global (values.global = settings.json, the base layer).
const scopeValue = computed(() => {
  const values = meta.value.values || {};
  if (activeProfile.value && scope.value === 'global') {
    return values.profile;
  }
  return values[scope.value];
});

// Whether the current scope inherits from a LOWER-PRIORITY user scope (not from defaults).
// Schema defaults are not "inherited" — they're just the absence of any user-set value.
const inherited = computed(() => scopeValue.value === undefined && effectiveScope.value !== 'default');

// Display value for input controls:
// - Has value at current scope → show it (user's explicit setting)
// - Inherited from another scope → show inherited value (visible but not "owned")
// - Only schema default → undefined (input stays empty, placeholder hints the default)
const displayValue = computed(() => {
  if (scopeValue.value !== undefined) return scopeValue.value;
  if (inherited.value) return effectiveValue.value;
  return undefined;
});

// Whether the value is overridden by a higher-priority scope
// Only relevant when viewing User scope and Workspace/Local has a value
const overriddenBy = computed(() => {
  const values = meta.value.values || {};
  if (scope.value === 'global') {
    // User value can be overridden by shared or local
    if (values.local !== undefined) return 'local';
    if (values.shared !== undefined) return 'shared';
  } else if (scope.value === 'shared') {
    // Workspace value can be overridden by local
    if (values.local !== undefined) return 'local';
  }
  return null;
});

const overriddenByLabel = computed(() => {
  if (!overriddenBy.value) return '';
  return SCOPE_MAP[overriddenBy.value] || overriddenBy.value;
});

const onUpdate = (newValue: any) => {
  updateSetting(props.settingKey, newValue, scope.value);
};

const onReset = () => {
  resetSetting(props.settingKey, scope.value);
};

const badgeLabel = computed(() => {
  if (effectiveScope.value === 'managed') return 'Managed';
  if (effectiveScope.value === 'cli') return 'CLI';
  return 'Unknown';
});

const badgeVariant = computed<'danger' | 'warning' | 'subtle'>(() => {
  if (effectiveScope.value === 'managed') return 'danger';
  if (effectiveScope.value === 'cli') return 'warning';
  return 'subtle';
});

const isReadOnly = computed(() => {
  return ['managed', 'cli'].includes(effectiveScope.value);
});
</script>

<style scoped>
.settings-item-reset-btn {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  cursor: pointer;
  color: var(--cursor-text-tertiary);
  transition: color 0.15s, background-color 0.15s;
  user-select: none;
}

.settings-item-reset-btn:hover {
  color: var(--cursor-text-primary);
  background-color: var(--cursor-bg-secondary);
}

.settings-item-reset-btn .codicon {
  font-size: 14px;
}
</style>
