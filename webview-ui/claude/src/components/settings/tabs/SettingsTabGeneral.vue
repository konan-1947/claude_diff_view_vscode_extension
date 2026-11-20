<template>
  <SettingsTab title="General">
    <!-- Startup Defaults Section (Extension Config — Pipeline B) -->
    <SettingsSection title="Startup Defaults">
      <SettingsSubSection>
        <SettingsCell
          label="Default Permission Mode"
          description="Permission mode for new sessions"
        >
          <template #trailing>
            <Dropdown
              :model-value="defaultPermissionMode"
              @update:model-value="updateExtensionSetting('defaultPermissionMode', $event)"
              :options="permissionModeOptions"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || 'Default' }}
              </template>
            </Dropdown>
          </template>
        </SettingsCell>
        <SettingsCell
          label="Extended Thinking"
          description="Enable extended thinking for new sessions"
          :divider="true"
        >
          <template #trailing>
            <div class="cursor-settings-cell-switch-container">
              <Switch
                :model-value="defaultThinkingLevel === 'default_on'"
                @update:model-value="updateExtensionSetting('defaultThinkingLevel', $event ? 'default_on' : 'off')"
                title="Extended Thinking"
              />
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Language & Output Section (Pipeline A — CC Settings) -->
    <SettingsSection title="Language & Output">
      <SettingsSubSection>
        <SettingsItem
          setting-key="language"
          label="Language"
          description="Preferred language for Claude responses"
        >
          <template #default="{ displayValue, update }">
            <TextInput
              :model-value="displayValue ?? ''"
              @change="update"
              placeholder="e.g. japanese, chinese"
              class="general-input"
            />
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="outputStyle"
          label="Output Style"
          description="Adjust Claude's response style"
          :divider="true"
        >
          <template #default="{ displayValue, update }">
            <TextInput
              :model-value="displayValue ?? ''"
              @change="update"
              placeholder="e.g. Explanatory, Concise"
              class="general-input"
            />
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Agent Behavior Section -->
    <SettingsSection title="Agent Behavior">
      <SettingsSubSection>
        <SettingsItem
          setting-key="respectGitignore"
          label="Respect .gitignore"
          description="Exclude files matching .gitignore patterns from context"
        >
          <template #default="{ effectiveValue, update }">
            <div class="cursor-settings-cell-switch-container">
              <Switch
                :model-value="effectiveValue ?? true"
                @update:model-value="update"
                title="Respect .gitignore"
              />
            </div>
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="teammateMode"
          label="Teammate Mode"
          description="How parallel agent teammates are displayed"
          :divider="true"
        >
          <template #default="{ effectiveValue, update }">
            <Dropdown
              :model-value="effectiveValue ?? 'auto'"
              @update:model-value="update"
              :options="teammateModeOptions"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || effectiveValue || 'Auto' }}
              </template>
            </Dropdown>
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="plansDirectory"
          label="Plans Directory"
          description="Relative path for storing plan files"
          :divider="true"
        >
          <template #default="{ displayValue, update }">
            <TextInput
              :model-value="displayValue ?? ''"
              @change="update"
              placeholder="~/.claude/plans"
              monospace
              class="general-input"
            />
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- UI & Experience Section -->
    <!-- TUI-only settings (not applicable to extension, kept for reference):
         spinnerTipsEnabled, terminalProgressBarEnabled, prefersReducedMotion -->
    <SettingsSection title="UI & Experience">
      <SettingsSubSection>
        <SettingsItem
          setting-key="showTurnDuration"
          label="Show Turn Duration"
          description="Display response time after each turn"
        >
          <template #default="{ effectiveValue, update }">
            <div class="cursor-settings-cell-switch-container">
              <Switch
                :model-value="effectiveValue ?? false"
                @update:model-value="update"
                title="Show Turn Duration"
              />
            </div>
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Notifications Section -->
    <SettingsSection title="Notifications">
      <SettingsSubSection>
        <SettingsItem
          setting-key="systemNotifications"
          label="System Notifications"
          description="Show system notifications when Agent completes or needs attention"
        >
          <template #default="{ effectiveValue, update }">
            <div class="cursor-settings-cell-switch-container">
              <Switch
                :model-value="effectiveValue ?? false"
                @update:model-value="update"
                title="System Notifications"
              />
            </div>
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="completionSound"
          label="Completion Sound"
          description="Play a sound when Agent finishes responding"
          :divider="true"
        >
          <template #default="{ effectiveValue, update }">
            <div class="cursor-settings-cell-switch-container">
              <Switch :model-value="effectiveValue ?? false" @update:model-value="update" title="Completion Sound" />
            </div>
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Git Attribution Section -->
    <SettingsSection title="Git Attribution">
      <SettingsSubSection>
        <SettingsItem
          setting-key="attribution"
          label="Commit Message"
          description="Text appended to git commit messages made by Claude"
        >
          <template #default="{ displayValue, effectiveValue, update }">
            <TextInput
              :model-value="(displayValue as any)?.commit ?? ''"
              @change="(val: string) => update({ ...(displayValue || effectiveValue || {}), commit: val || undefined })"
              placeholder="Generated with Claude"
              class="general-input"
            />
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="attribution"
          label="PR Description"
          description="Text appended to pull request descriptions made by Claude"
          :divider="true"
        >
          <template #default="{ displayValue, effectiveValue, update }">
            <TextInput
              :model-value="(displayValue as any)?.pr ?? ''"
              @change="(val: string) => update({ ...(displayValue || effectiveValue || {}), pr: val || undefined })"
              placeholder="Generated with Claude"
              class="general-input"
            />
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Chat History Section -->
    <SettingsSection title="Chat History">
      <SettingsSubSection>
        <SettingsCell
          label="Cleanup Period"
          description="How long to locally retain chat transcripts based on last activity date"
        >
          <template #trailing>
            <div class="flex items-center gap-2">
              <NumberInput
                :model-value="cleanupPeriodDays"
                @update:model-value="updateCleanupPeriod"
                :min="1"
                width="68px"
              />
              <span class="text-xs text-(--cursor-text-secondary)">days</span>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Advanced Section -->
    <SettingsSection title="Advanced">
      <SettingsSubSection>
        <SettingsItem
          setting-key="autoUpdatesChannel"
          label="Updates Channel"
          description="Choose between stable releases or latest builds"
        >
          <template #default="{ effectiveValue, update }">
            <Dropdown
              :model-value="effectiveValue ?? 'stable'"
              @update:model-value="update"
              :options="updatesChannelOptions"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || effectiveValue || 'Stable' }}
              </template>
            </Dropdown>
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="forceLoginMethod"
          label="Login Method"
          description="Restrict authentication to a specific method"
          :divider="true"
        >
          <template #default="{ effectiveValue, update }">
            <Dropdown
              :model-value="effectiveValue || 'none'"
              @update:model-value="(val: string) => update(val === 'none' ? '' : val)"
              :options="loginMethodOptions"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || 'Not restricted' }}
              </template>
            </Dropdown>
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="apiKeyHelper"
          label="API Key Helper"
          description="Custom script to generate authentication tokens"
          :divider="true"
        >
          <template #default="{ displayValue, update }">
            <TextInput
              :model-value="displayValue ?? ''"
              @change="update"
              placeholder="/path/to/script.sh"
              monospace
              class="general-input"
            />
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import SettingsItem from '../SettingsItem.vue';
import Switch from '../../Common/Switch.vue';
import Dropdown from '../../Common/Dropdown.vue';
import TextInput from '../../Common/TextInput.vue';
import NumberInput from '../../Common/NumberInput.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';
import { transport } from '../../../core/runtimeTransport';

const { settings, updateSetting } = useSettingsStore();

// ── Chat History ──
const cleanupPeriodDays = computed(() => settings.value.cleanupPeriodDays ?? 720);
const updateCleanupPeriod = (value: number) => {
  updateSetting('cleanupPeriodDays', value, 'global');
};

// ── Extension Config (Pipeline B — ~/.uic.json) ──
const defaultPermissionMode = ref('default');
const defaultThinkingLevel = ref('default_on');

onMounted(async () => {
  try {
    const response = await transport.getExtensionConfig();
    if (response?.config) {
      defaultPermissionMode.value = response.config.defaultPermissionMode || 'default';
      defaultThinkingLevel.value = response.config.defaultThinkingLevel || 'default_on';
    }
  } catch (e) {
    console.error('Failed to load extension config:', e);
  }
});

async function updateExtensionSetting(key: string, value: any) {
  try {
    await transport.updateExtensionConfig(key, value);
    switch (key) {
      case 'defaultPermissionMode':
        defaultPermissionMode.value = value;
        break;
      case 'defaultThinkingLevel':
        defaultThinkingLevel.value = value;
        break;
    }
  } catch (e) {
    console.error('Failed to update extension config:', e);
  }
}

// ── Dropdown Options ──

const permissionModeOptions = [
  { label: 'Default', value: 'default', description: 'Standard behavior, prompt for dangerous operations' },
  { label: 'Accept Edits', value: 'acceptEdits', description: 'Automatically accept file edits' },
  { label: 'Plan Mode', value: 'plan', description: 'Planning only, no actual execution' },
  { label: "Don't Ask", value: 'dontAsk', description: "Don't prompt, deny if not pre-approved" },
];

const teammateModeOptions = [
  { label: 'Auto', value: 'auto', description: 'Automatically choose display mode' },
  { label: 'In-Process', value: 'in-process', description: 'Run teammates in-process' },
  { label: 'Tmux', value: 'tmux', description: 'Run teammates in tmux panes' },
];

const updatesChannelOptions = [
  { label: 'Stable', value: 'stable', description: 'Stable releases only' },
  { label: 'Latest', value: 'latest', description: 'Include pre-release builds' },
];

const loginMethodOptions = [
  { label: 'Not restricted', value: 'none', description: 'Allow any login method' },
  { label: 'Claude.ai', value: 'claudeai', description: 'Restrict to Claude.ai accounts' },
  { label: 'Console', value: 'console', description: 'Restrict to Anthropic Console API' },
];
</script>

<style scoped>
.general-input {
  width: 200px;
}
</style>
