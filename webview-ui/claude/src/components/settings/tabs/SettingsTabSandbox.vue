<template>
  <SettingsTab title="Sandbox">
    <!-- Sandbox Isolation Section -->
    <SettingsSection title="Sandbox Isolation">
      <SettingsSubSection>
        <SettingsCell label="Enable Sandbox" description="Isolate Bash commands in a sandbox for enhanced security (macOS/Linux only)">
          <template #trailing>
            <Switch v-model="sandboxEnabled" />
          </template>
        </SettingsCell>

        <SettingsCell
          label="Auto-approve Bash when Sandboxed"
          description="Automatically approve Bash commands when sandbox is enabled"
          :divider="true"
        >
          <template #trailing>
            <Switch v-model="autoAllowBash" :disabled="!sandboxEnabled" />
          </template>
        </SettingsCell>

        <SettingsCell
          label="Allow Unsandboxed Commands"
          description="Allow commands to run outside sandbox via dangerouslyDisableSandbox parameter"
          :divider="true"
        >
          <template #trailing>
            <Switch v-model="allowUnsandboxed" :disabled="!sandboxEnabled" />
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Excluded Commands Section -->
    <SettingsSection title="Excluded Commands">
      <SettingsSubSection>
        <SettingsCell label="Commands to Run Outside Sandbox" description="Commands that should always run outside the sandbox (e.g., docker, git)">
          <template #bottom>
            <div class="flex flex-wrap gap-2 mt-2">
              <div
                v-for="(cmd, index) in excludedCommands"
                :key="index"
                class="inline-flex items-center gap-1 px-2 py-1 bg-(--cursor-bg-tertiary) rounded text-xs"
              >
                <span>{{ cmd }}</span>
                <button
                  class="hover:text-(--cursor-text-red-primary) transition-colors"
                  @click="removeExcludedCommand(index)"
                >
                  <span class="codicon codicon-close"></span>
                </button>
              </div>
              <TextInput
                v-model="newCommand"
                placeholder="Add command..."
                @keydown.enter="addExcludedCommand"
              />
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Network Configuration Section -->
    <SettingsSection title="Network Configuration">
      <SettingsSubSection>
        <SettingsCell label="Allow Local Binding" description="Allow sandboxed commands to bind to localhost ports (macOS only)">
          <template #trailing>
            <Switch v-model="allowLocalBinding" :disabled="!sandboxEnabled" />
          </template>
        </SettingsCell>

        <SettingsCell
          label="Allowed Unix Sockets"
          description="Unix socket paths that sandboxed commands can access (e.g., SSH agent)"
          :divider="true"
        >
          <template #bottom>
            <div class="flex flex-wrap gap-2 mt-2">
              <div
                v-for="(socket, index) in allowedUnixSockets"
                :key="index"
                class="inline-flex items-center gap-1 px-2 py-1 bg-(--cursor-bg-tertiary) rounded text-xs font-mono"
              >
                <span>{{ socket }}</span>
                <button
                  class="hover:text-(--cursor-text-red-primary) transition-colors"
                  @click="removeUnixSocket(index)"
                >
                  <span class="codicon codicon-close"></span>
                </button>
              </div>
              <TextInput
                v-model="newSocket"
                placeholder="Add socket path..."
                monospace
                @keydown.enter="addUnixSocket"
              />
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Proxy Configuration Section -->
    <SettingsSection title="Proxy Configuration">
      <SettingsSubSection>
        <SettingsCell label="HTTP Proxy Port" description="Custom HTTP proxy port for sandboxed network access">
          <template #trailing>
            <NumberInput
              :model-value="httpProxyPort ?? 0"
              @update:model-value="httpProxyPort = $event || undefined"
              :min="0"
              :max="65535"
              width="68px"
              :disabled="!sandboxEnabled"
            />
          </template>
        </SettingsCell>

        <SettingsCell label="SOCKS Proxy Port" description="Custom SOCKS5 proxy port for sandboxed network access" :divider="true">
          <template #trailing>
            <NumberInput
              :model-value="socksProxyPort ?? 0"
              @update:model-value="socksProxyPort = $event || undefined"
              :min="0"
              :max="65535"
              width="68px"
              :disabled="!sandboxEnabled"
            />
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import Switch from '../../Common/Switch.vue';
import NumberInput from '../../Common/NumberInput.vue';
import TextInput from '../../Common/TextInput.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';

const { settings, updateSetting } = useSettingsStore();

// Sandbox settings
const sandboxEnabled = ref(false);
const autoAllowBash = ref(true);
const allowUnsandboxed = ref(true);
const excludedCommands = ref<string[]>([]);
const newCommand = ref('');

// Network settings
const allowLocalBinding = ref(false);
const allowedUnixSockets = ref<string[]>([]);
const newSocket = ref('');
const httpProxyPort = ref<number | undefined>(undefined);
const socksProxyPort = ref<number | undefined>(undefined);

// Load settings on mount
onMounted(() => {
  const sandbox = settings.value?.sandbox || {};
  sandboxEnabled.value = sandbox.enabled ?? false;
  autoAllowBash.value = sandbox.autoAllowBashIfSandboxed ?? true;
  allowUnsandboxed.value = sandbox.allowUnsandboxedCommands ?? true;
  excludedCommands.value = sandbox.excludedCommands ?? [];

  const network = sandbox.network || {};
  allowLocalBinding.value = network.allowLocalBinding ?? false;
  allowedUnixSockets.value = network.allowUnixSockets ?? [];
  httpProxyPort.value = network.httpProxyPort;
  socksProxyPort.value = network.socksProxyPort;
});

// Watch and save changes
watch(sandboxEnabled, (val) => {
  updateSetting('sandbox', { ...getSandboxConfig(), enabled: val });
});

watch(autoAllowBash, (val) => {
  updateSetting('sandbox', { ...getSandboxConfig(), autoAllowBashIfSandboxed: val });
});

watch(allowUnsandboxed, (val) => {
  updateSetting('sandbox', { ...getSandboxConfig(), allowUnsandboxedCommands: val });
});

watch(allowLocalBinding, (val) => {
  const sandbox = getSandboxConfig();
  sandbox.network = { ...sandbox.network, allowLocalBinding: val };
  updateSetting('sandbox', sandbox);
});

watch(httpProxyPort, (val) => {
  const sandbox = getSandboxConfig();
  sandbox.network = { ...sandbox.network, httpProxyPort: val };
  updateSetting('sandbox', sandbox);
});

watch(socksProxyPort, (val) => {
  const sandbox = getSandboxConfig();
  sandbox.network = { ...sandbox.network, socksProxyPort: val };
  updateSetting('sandbox', sandbox);
});

function getSandboxConfig() {
  return {
    enabled: sandboxEnabled.value,
    autoAllowBashIfSandboxed: autoAllowBash.value,
    allowUnsandboxedCommands: allowUnsandboxed.value,
    excludedCommands: excludedCommands.value,
    network: {
      allowLocalBinding: allowLocalBinding.value,
      allowUnixSockets: allowedUnixSockets.value,
      httpProxyPort: httpProxyPort.value,
      socksProxyPort: socksProxyPort.value
    }
  };
}

function addExcludedCommand() {
  const cmd = newCommand.value.trim();
  if (cmd && !excludedCommands.value.includes(cmd)) {
    excludedCommands.value.push(cmd);
    newCommand.value = '';
    updateSetting('sandbox', getSandboxConfig());
  }
}

function removeExcludedCommand(index: number) {
  excludedCommands.value.splice(index, 1);
  updateSetting('sandbox', getSandboxConfig());
}

function addUnixSocket() {
  const socket = newSocket.value.trim();
  if (socket && !allowedUnixSockets.value.includes(socket)) {
    allowedUnixSockets.value.push(socket);
    newSocket.value = '';
    updateSetting('sandbox', getSandboxConfig());
  }
}

function removeUnixSocket(index: number) {
  allowedUnixSockets.value.splice(index, 1);
  updateSetting('sandbox', getSandboxConfig());
}
</script>

<style scoped>
/* TextInput handles all styling via Common/TextInput.vue */
</style>
