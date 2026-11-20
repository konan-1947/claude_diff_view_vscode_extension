<template>
  <SettingsTab title="Network">
    <!-- Proxy Configuration Section -->
    <SettingsSection title="Proxy Configuration">
      <SettingsSubSection>
        <SettingsCell
          v-for="(field, index) in PROXY_FIELDS"
          :key="field.key"
          :description="field.description"
          :divider="index > 0"
          :class="{ 'network-inherited-cell': isInherited(field.key) }"
        >
          <template #label>
            {{ field.label }}
            <Tooltip v-if="isInherited(field.key)" content="Inherited from a lower-priority scope">
              <Badge variant="subtle">inherited</Badge>
            </Tooltip>
          </template>
          <template #trailing>
            <TextInput
              v-model="fieldValues[field.key]"
              :placeholder="field.placeholder"
              @change="updateEnvVar(field.key, $event)"
            />
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- mTLS Authentication Section -->
    <SettingsSection title="mTLS Authentication">
      <SettingsSubSection>
        <SettingsCell
          v-for="(field, index) in MTLS_FIELDS"
          :key="field.key"
          :description="field.description"
          :divider="index > 0"
          :class="{ 'network-inherited-cell': isInherited(field.key) }"
        >
          <template #label>
            {{ field.label }}
            <Tooltip v-if="isInherited(field.key)" content="Inherited from a lower-priority scope">
              <Badge variant="subtle">inherited</Badge>
            </Tooltip>
          </template>
          <template #trailing>
            <TextInput
              v-model="fieldValues[field.key]"
              :type="field.type || 'text'"
              :placeholder="field.placeholder"
              @change="updateEnvVar(field.key, $event)"
            />
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { reactive, computed, watchEffect } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import Badge from '../../Common/Badge.vue';
import TextInput from '../../Common/TextInput.vue';
import Tooltip from '../../Common/Tooltip.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';
import { useSettingsScope } from '../../../composables/useSettingsScope';

const { settings, activeProfile, inspect, updateSetting } = useSettingsStore();
const scope = useSettingsScope();

// ── Field definitions ──

interface NetworkField {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  type?: 'text' | 'password';
}

const PROXY_FIELDS: NetworkField[] = [
  { key: 'HTTP_PROXY', label: 'HTTP Proxy', description: 'HTTP proxy server for network connections', placeholder: 'http://proxy:port' },
  { key: 'HTTPS_PROXY', label: 'HTTPS Proxy', description: 'HTTPS proxy server for network connections', placeholder: 'https://proxy:port' },
  { key: 'NO_PROXY', label: 'No Proxy', description: 'Domains and IPs to bypass proxy (comma-separated)', placeholder: 'localhost,127.0.0.1' },
];

const MTLS_FIELDS: NetworkField[] = [
  { key: 'CLAUDE_CODE_CLIENT_CERT', label: 'Client Certificate', description: 'Path to client certificate file for mTLS authentication', placeholder: '/path/to/cert.pem' },
  { key: 'CLAUDE_CODE_CLIENT_KEY', label: 'Client Key', description: 'Path to client private key file for mTLS authentication', placeholder: '/path/to/key.pem' },
  { key: 'CLAUDE_CODE_CLIENT_KEY_PASSPHRASE', label: 'Key Passphrase', description: 'Passphrase for encrypted client key (optional)', placeholder: '********', type: 'password' },
];

const ALL_KEYS = [...PROXY_FIELDS, ...MTLS_FIELDS].map(f => f.key);

// ── Scope-aware reactive data ──

// Env at the current editing scope only (profile layer when profile active)
const scopeEnv = computed<Record<string, string>>(() => {
  void settings.value;
  const meta = inspect('env');
  const values = meta?.values || {};
  if (activeProfile.value && scope.value === 'global') {
    return (values.profile as Record<string, string>) || {};
  }
  return (values[scope.value] as Record<string, string>) || {};
});

// Effective env (deep-merged from all layers)
const effectiveEnv = computed<Record<string, string>>(() => {
  const val = settings.value?.env;
  return (val && typeof val === 'object' ? val : {}) as Record<string, string>;
});

// ── Field values (reactive, synced with effective env on scope/settings change) ──

const fieldValues = reactive<Record<string, string>>({});

watchEffect(() => {
  const env = effectiveEnv.value;
  for (const key of ALL_KEYS) {
    fieldValues[key] = env[key] || '';
  }
});

// ── Inherited detection ──

function isInherited(key: string): boolean {
  // A field is "inherited" when it has an effective value
  // but that value is NOT set at the current editing scope
  return !!effectiveEnv.value[key] && !(key in scopeEnv.value);
}

// ── Write handler ──

const updateEnvVar = (key: string, value: string) => {
  // Write to scope-specific env only (profile-only when profile active)
  // to avoid polluting profile file with inherited env vars
  const env: Record<string, string> = { ...scopeEnv.value };
  if (value) {
    env[key] = value;
  } else {
    delete env[key];
  }
  updateSetting('env', env, scope.value);
};
</script>

<style scoped>
.network-inherited-cell {
  opacity: 0.7;
}
</style>
