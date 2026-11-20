<template>
  <div class="cursor-settings-pane-outer-wrapper outline-none!" tabindex="-1">
    <div
      class="scrollable-div-container custom-scroll-container"
      style="height: 100%; overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable"
    >
      <div class="cursor-settings-layout-main">
        <SettingsSidebar
          :active-tab="activeTab"
          :tabs="tabs"
          @update:active-tab="activeTab = $event"
        />

        <div class="cursor-settings-pane-content">
          <!-- Scope Tab (top-right) -->
          <div class="cursor-settings-scope-bar">
            <SettingsScopeTab
              v-model="activeScope"
              :has-workspace="hasWorkspace"
              :active-profile="activeProfile"
            />
          </div>

          <component :is="currentTabComponent" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide } from 'vue';
import SettingsSidebar from '../components/settings/SettingsSidebar.vue';
import SettingsScopeTab from '../components/settings/SettingsScopeTab.vue';
import SettingsTabGeneral from '../components/settings/tabs/SettingsTabGeneral.vue';
import SettingsTabModels from '../components/settings/tabs/SettingsTabModels.vue';
import SettingsTabProfiles from '../components/settings/tabs/SettingsTabProfiles.vue';
import SettingsTabEnvironments from '../components/settings/tabs/SettingsTabEnvironments.vue';
import SettingsTabMemoryAndRules from '../components/settings/tabs/SettingsTabMemoryAndRules.vue';
import SettingsTabPermissions from '../components/settings/tabs/SettingsTabPermissions.vue';
import SettingsTabSandbox from '../components/settings/tabs/SettingsTabSandbox.vue';
import SettingsTabNetwork from '../components/settings/tabs/SettingsTabNetwork.vue';
import SettingsTabMCPServers from '../components/settings/tabs/SettingsTabMCPServers.vue';
import SettingsTabHooks from '../components/settings/tabs/SettingsTabHooks.vue';
import SettingsTabSlashCommands from '../components/settings/tabs/SettingsTabSlashCommands.vue';
import SettingsTabSkills from '../components/settings/tabs/SettingsTabSkills.vue';
import SettingsTabPlugins from '../components/settings/tabs/SettingsTabPlugins.vue';
import { SettingsStore } from '../core/SettingsStore';
import { initSettingsStore, useSettingsStore } from '../composables/useSettingsStore';
import type { SettingsScope } from '../composables/useSettingsStore';
import { transport } from '../core/runtimeTransport';
import { SETTINGS_SCOPE_KEY } from '../composables/useSettingsScope';

// Reuse global Transport instance
const settingsStore = new SettingsStore(transport);
initSettingsStore(settingsStore);

const { hasWorkspace, activeProfile } = useSettingsStore();

const activeTab = ref('general');
const activeScope = ref<SettingsScope>('global');

// Provide scope to all child components (SettingsItem etc.)
provide(SETTINGS_SCOPE_KEY, activeScope);

const tabs = [
  // Profiles & Preferences
  { id: 'general', label: 'General', icon: 'mdi-cog' },
  { id: 'models', label: 'Models', icon: 'codicon-cube' },
  { id: 'profiles', label: 'Profiles', icon: 'mdi-account-cog-outline', divider: true },
  // Plugins & Environments
  { id: 'plugins', label: 'Plugins', icon: 'codicon-extensions' },
  { id: 'environments', label: 'Environments', icon: 'codicon-symbol-variable' },
  { id: 'memory-and-rules', label: 'Memory and Rules', icon: 'codicon-clipboard-list', divider: true },
  // Security & Permissions
  { id: 'permissions', label: 'Permissions', icon: 'mdi-shield-key-outline' },
  { id: 'sandbox', label: 'Sandbox', icon: 'mdi-file-table-box-outline' },
  { id: 'network', label: 'Network', icon: 'mdi-earth', divider: true },
  // Extensions & Customization
  { id: 'hooks', label: 'Hooks', icon: 'codicon-debug-line-by-line' },
  { id: 'skills', label: 'Skills', icon: 'codicon-wand' },
  { id: 'mcp-servers', label: 'MCP Servers', icon: 'codicon-cube-nodes' },
  { id: 'slash-commands', label: 'Slash Commands', icon: 'mdi-apple-keyboard-command' },
];

const currentTabComponent = computed(() => {
  switch (activeTab.value) {
    case 'general':
      return SettingsTabGeneral;
    case 'profiles':
      return SettingsTabProfiles;
    case 'models':
      return SettingsTabModels;
    case 'environments':
      return SettingsTabEnvironments;
    case 'memory-and-rules':
      return SettingsTabMemoryAndRules;
    case 'permissions':
      return SettingsTabPermissions;
    case 'sandbox':
      return SettingsTabSandbox;
    case 'network':
      return SettingsTabNetwork;
    case 'mcp-servers':
      return SettingsTabMCPServers;
    case 'hooks':
      return SettingsTabHooks;
    case 'slash-commands':
      return SettingsTabSlashCommands;
    case 'skills':
      return SettingsTabSkills;
    case 'plugins':
      return SettingsTabPlugins;
    default:
      return SettingsTabGeneral;
  }
});
</script>

<style>
/* Global layout styles for settings page */
:root {
  --cursor-text-tonedPrimary: var(--vscode-editor-foreground);
  --cursor-text-primary: var(--vscode-foreground);
  --cursor-text-secondary: color-mix(in srgb, var(--vscode-foreground) 60%, transparent);
  --cursor-text-tertiary: color-mix(in srgb, var(--vscode-foreground) 40%, transparent);
  --cursor-text-quaternary: color-mix(in srgb, var(--vscode-foreground) 28%, transparent);
  --cursor-text-red-primary: var(--vscode-charts-red);
  --cursor-text-red-secondary: color-mix(in srgb, var(--vscode-charts-red) 68%, transparent);
  --cursor-text-yellow-primary: var(--vscode-charts-yellow);
  --cursor-text-yellow-secondary: color-mix(in srgb, var(--vscode-charts-yellow) 68%, transparent);
  --cursor-text-green-primary: var(--vscode-charts-green);
  --cursor-text-green-secondary: color-mix(in srgb, var(--vscode-charts-green) 68%, transparent);
  --cursor-text-magenta-primary: var(--vscode-charts-purple);
  --cursor-text-magenta-secondary: color-mix(in srgb, var(--vscode-charts-purple) 68%, transparent);
  --cursor-text-cyan-primary: var(--vscode-charts-blue);
  --cursor-text-cyan-secondary: color-mix(in srgb, var(--vscode-charts-blue) 68%, transparent);
  --cursor-text-orange-primary: var(--vscode-charts-orange);
  --cursor-text-orange-secondary: color-mix(in srgb, var(--vscode-charts-orange) 68%, transparent);
  --cursor-icon-primary: color-mix(in srgb, var(--vscode-foreground) 92%, transparent);
  --cursor-icon-secondary: color-mix(in srgb, var(--vscode-foreground) 56%, transparent);
  --cursor-icon-tertiary: color-mix(in srgb, var(--vscode-foreground) 40%, transparent);
  --cursor-icon-quaternary: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
  --cursor-icon-red-primary: color-mix(in srgb, var(--vscode-charts-red) 92%, transparent);
  --cursor-icon-red-secondary: color-mix(in srgb, var(--vscode-charts-red) 60%, transparent);
  --cursor-icon-yellow-primary: color-mix(in srgb, var(--vscode-charts-yellow) 92%, transparent);
  --cursor-icon-yellow-secondary: color-mix(in srgb, var(--vscode-charts-yellow) 60%, transparent);
  --cursor-icon-green-primary: color-mix(in srgb, var(--vscode-charts-green) 92%, transparent);
  --cursor-icon-green-secondary: color-mix(in srgb, var(--vscode-charts-green) 60%, transparent);
  --cursor-icon-magenta-primary: color-mix(in srgb, var(--vscode-charts-purple) 92%, transparent);
  --cursor-icon-magenta-secondary: color-mix(in srgb, var(--vscode-charts-purple) 60%, transparent);
  --cursor-icon-cyan-primary: color-mix(in srgb, var(--vscode-charts-blue) 92%, transparent);
  --cursor-icon-cyan-secondary: color-mix(in srgb, var(--vscode-charts-blue) 60%, transparent);
  --cursor-bg-primary: color-mix(in srgb, var(--vscode-foreground) 20%, transparent);
  --cursor-bg-secondary: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
  --cursor-bg-tertiary: color-mix(in srgb, var(--vscode-foreground) 4%, transparent);
  --cursor-bg-elevated: var(--vscode-quickInput-background);
  --cursor-bg-yellow-primary: var(--vscode-charts-yellow);
  --cursor-bg-yellow-secondary: color-mix(in srgb, var(--vscode-charts-yellow) 12%, transparent);
  --cursor-bg-red-primary: var(--vscode-charts-red);
  --cursor-bg-red-secondary: color-mix(in srgb, var(--vscode-charts-red) 12%, transparent);
  --cursor-bg-green-primary: var(--vscode-charts-green);
  --cursor-bg-green-secondary: color-mix(in srgb, var(--vscode-charts-green) 12%, transparent);
  --cursor-bg-magenta-primary: var(--vscode-charts-purple);
  --cursor-bg-magenta-secondary: color-mix(in srgb, var(--vscode-charts-purple) 12%, transparent);
  --cursor-stroke-primary: color-mix(in srgb, var(--vscode-foreground) 16%, transparent);
  --cursor-stroke-secondary: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
  --cursor-stroke-tertiary: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
  --cursor-stroke-quaternary: color-mix(in srgb, var(--vscode-foreground) 4%, transparent);
  --cursor-stroke-red-primary: color-mix(in srgb, var(--vscode-charts-red) 56%, transparent);
  --cursor-stroke-red-secondary: color-mix(in srgb, var(--vscode-charts-red) 32%, transparent);
  --cursor-stroke-yellow-primary: color-mix(in srgb, var(--vscode-charts-yellow) 56%, transparent);
  --cursor-stroke-yellow-secondary: color-mix(
    in srgb,
    var(--vscode-charts-yellow) 32%,
    transparent
  );
  --cursor-stroke-green-primary: color-mix(in srgb, var(--vscode-charts-green) 56%, transparent);
  --cursor-stroke-green-secondary: color-mix(in srgb, var(--vscode-charts-green) 32%, transparent);
  --cursor-stroke-magenta-primary: color-mix(in srgb, var(--vscode-charts-purple) 56%, transparent);
  --cursor-stroke-magenta-secondary: color-mix(
    in srgb,
    var(--vscode-charts-purple) 32%,
    transparent
  );
  --cursor-stroke-cyan-primary: color-mix(in srgb, var(--vscode-charts-blue) 56%, transparent);
  --cursor-stroke-cyan-secondary: color-mix(in srgb, var(--vscode-charts-blue) 32%, transparent);
  --cursor-shadow-primary: var(--vscode-widget-shadow);
  --cursor-shadow-secondary: color-mix(in srgb, var(--vscode-widget-shadow) 60%, transparent);
  --cursor-shadow-tertiary: color-mix(in srgb, var(--vscode-widget-shadow) 30%, transparent);
  --cursor-box-shadow-sm: 0 2px 8px 0px var(--cursor-shadow-secondary);
  --cursor-box-shadow-md: 0 0 8px 2px var(--cursor-shadow-primary);
  --cursor-box-shadow-lg:
    0 0 4px 0 hsla(0, 0%, 100%, 0.05) inset, 0 0 3px 0 var(--cursor-shadow-secondary),
    0 16px 24px 0 var(--cursor-shadow-tertiary);
  --cursor-box-shadow-xl:
    0 0 4px 0 hsla(0, 0%, 100%, 0.05) inset, 0 0 6px 8px var(--cursor-shadow-secondary),
    0 24px 16px 6px var(--cursor-shadow-tertiary);
  --cursor-shadow-workbench: 0 0 8px 2px
    color-mix(in srgb, var(--vscode-widget-shadow) 40%, transparent);
  --cursor-shadow-hover-tooltip: 0 2px 4px var(--cursor-shadow-secondary);
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  :root {
    --cursor-text-tonedPrimary: var(--vscode-editor-foreground);
    --cursor-text-primary: var(--vscode-foreground);
    --cursor-text-secondary: color-mix(in srgb, var(--vscode-foreground) 72%, transparent);
    --cursor-text-tertiary: var(--vscode-disabledForeground);
    --cursor-text-quaternary: color-mix(in srgb, var(--vscode-foreground) 20%, transparent);
    --cursor-text-red-primary: var(--vscode-charts-red);
    --cursor-text-red-secondary: color-mix(in srgb, var(--vscode-charts-red) 68%, transparent);
    --cursor-text-yellow-primary: var(--vscode-charts-yellow);
    --cursor-text-yellow-secondary: color-mix(
      in srgb,
      var(--vscode-charts-yellow) 68%,
      transparent
    );
    --cursor-text-green-primary: var(--vscode-charts-green);
    --cursor-text-green-secondary: color-mix(in srgb, var(--vscode-charts-green) 68%, transparent);
    --cursor-text-magenta-primary: var(--vscode-charts-purple);
    --cursor-text-magenta-secondary: color-mix(
      in srgb,
      var(--vscode-charts-purple) 68%,
      transparent
    );
    --cursor-text-cyan-primary: var(--vscode-charts-blue);
    --cursor-text-cyan-secondary: color-mix(in srgb, var(--vscode-charts-blue) 68%, transparent);
    --cursor-icon-primary: color-mix(in srgb, var(--vscode-foreground) 92%, transparent);
    --cursor-icon-secondary: color-mix(in srgb, var(--vscode-foreground) 64%, transparent);
    --cursor-icon-tertiary: color-mix(in srgb, var(--vscode-disabledForeground) 92%, transparent);
    --cursor-icon-quaternary: color-mix(in srgb, var(--vscode-foreground) 16%, transparent);
    --cursor-icon-red-primary: var(--vscode-charts-red);
    --cursor-icon-red-secondary: color-mix(in srgb, var(--vscode-charts-red) 64%, transparent);
    --cursor-icon-yellow-primary: var(--vscode-charts-yellow);
    --cursor-icon-yellow-secondary: color-mix(
      in srgb,
      var(--vscode-charts-yellow) 64%,
      transparent
    );
    --cursor-icon-green-primary: var(--vscode-charts-green);
    --cursor-icon-green-secondary: color-mix(in srgb, var(--vscode-charts-green) 64%, transparent);
    --cursor-icon-magenta-primary: var(--vscode-charts-purple);
    --cursor-icon-magenta-secondary: color-mix(
      in srgb,
      var(--vscode-charts-purple) 64%,
      transparent
    );
    --cursor-bg-primary: color-mix(in srgb, var(--vscode-foreground) 48%, transparent);
    --cursor-bg-secondary: color-mix(in srgb, var(--vscode-foreground) 20%, transparent);
    --cursor-bg-tertiary: color-mix(in srgb, var(--vscode-foreground) 6%, transparent);
    --cursor-bg-elevated: var(--vscode-quickInput-background);
    --cursor-bg-red-primary: var(--vscode-charts-red);
    --cursor-bg-red-secondary: color-mix(in srgb, var(--vscode-charts-red) 6%, transparent);
    --cursor-bg-yellow-primary: var(--vscode-charts-yellow);
    --cursor-bg-yellow-secondary: color-mix(in srgb, var(--vscode-charts-yellow) 6%, transparent);
    --cursor-bg-green-primary: var(--vscode-charts-green);
    --cursor-bg-green-secondary: color-mix(in srgb, var(--vscode-charts-green) 6%, transparent);
    --cursor-bg-magenta-primary: var(--vscode-charts-purple);
    --cursor-bg-magenta-secondary: color-mix(in srgb, var(--vscode-charts-purple) 6%, transparent);
    --cursor-stroke-primary: var(--vscode-input-border);
    --cursor-stroke-secondary: var(--vscode-input-border);
    --cursor-stroke-tertiary: var(--vscode-input-border);
    --cursor-stroke-quaternary: var(--vscode-input-border);
    --cursor-stroke-red-primary: var(--vscode-charts-red);
    --cursor-stroke-red-secondary: color-mix(in srgb, var(--vscode-charts-red) 56%, transparent);
    --cursor-stroke-yellow-primary: var(--vscode-charts-yellow);
    --cursor-stroke-yellow-secondary: color-mix(
      in srgb,
      var(--vscode-charts-yellow) 56%,
      transparent
    );
    --cursor-stroke-green-primary: var(--vscode-charts-green);
    --cursor-stroke-green-secondary: color-mix(
      in srgb,
      var(--vscode-charts-green) 56%,
      transparent
    );
    --cursor-stroke-magenta-primary: var(--vscode-charts-purple);
    --cursor-stroke-magenta-secondary: color-mix(
      in srgb,
      var(--vscode-charts-purple) 56%,
      transparent
    );
  }
}

.scrollable-div-container.show-only-on-hover:not(:hover) .scrollbar,
.scrollable-div-container.show-only-on-scroll:not(.is-scrolling) .scrollbar,
.show-only-on-hover-force:not(:hover) .scrollbar {
  opacity: 0 !important;
}

.zero-padding,
.zero-padding * {
  padding: 0 !important;
}

.cursor-settings-pane-outer-wrapper {
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  display: flex;
  flex-direction: column;
  font-size: 12px;
  height: 100%;
  margin: 0 auto;
  position: relative;
  width: 100%;
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
}

.cursor-settings-pane-outer-wrapper input,
.cursor-settings-pane-outer-wrapper textarea,
.cursor-settings-pane-outer-wrapper [contenteditable],
.cursor-settings-pane-outer-wrapper code {
  -webkit-user-select: text;
  -moz-user-select: text;
  user-select: text;
}

.cursor-settings-layout-main {
  align-items: flex-start;
  box-sizing: border-box;
  display: flex;
  flex: 1;
  gap: 48px;
  margin: 0 auto;
  max-width: 1000px;
  padding: 0 48px;
  width: 100%;
}

.cursor-settings-pane-content {
  align-self: stretch;
  box-sizing: border-box;
  flex: 1 1 0;
  min-width: 200px;
  position: relative;
}

.cursor-settings-scope-bar {
  position: absolute;
  top: 52px;
  right: 0;
}

.cursor-settings-rules-list {
  background: var(--cursor-bg-tertiary);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  width: 100%;
}

.cursor-settings-rules-list-header {
  align-items: center;
  color: var(--cursor-text-secondary);
  display: flex;
  font-size: 12px;
  font-weight: 400;
  gap: 20px;
  justify-content: space-between;
  padding: 8px 12px;
}

.cursor-settings-rules-cell {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  transition: background-color 0.1s ease;
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
}

.cursor-settings-tab-footer-actions {
  align-items: center;
  display: flex;
  flex-direction: row;
  gap: 8px;
  justify-content: flex-start;
  padding: 0 8px;
}

.cursor-settings-dialog-preferences {
  align-items: stretch;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 12px;
}

.cursor-settings-dialog-preferences-list {
  display: flex;
  flex-direction: column;
}

.cursor-settings-dialog-preferences-cell {
  align-items: center;
  border-radius: 4px;
  display: flex;
  font-size: 12px;
  justify-content: space-between;
  padding: 8px 0;
  position: relative;
}

.cursor-settings-dialog-preferences-footer {
  align-self: stretch;
  border-top: 1px solid var(--cursor-stroke-tertiary);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  padding: 13px 0 12px;
}

.cursor-settings-dialog-preferences-cell:first-child .cursor-settings-cell-divider {
  display: none;
}

/* Switch Styles - Verified from ref.css */
.cursor-settings-cell-switch-container {
  align-items: center;
  box-sizing: border-box;
  display: flex;
  height: 18px;
}

.solid-switch {
  align-items: center;
  box-sizing: border-box;
  display: inline-flex;
  flex-shrink: 0;
  height: 18px;
  position: relative;
  width: 30px;
}

.solid-switch-small {
  height: 14px;
  width: 24px;
}

.solid-switch-toggle {
  background-color: var(--cursor-bg-primary);
  border-radius: 9px;
  bottom: 0;
  box-sizing: border-box;
  cursor: pointer;
  flex-shrink: 0;
  left: 0;
  position: absolute;
  right: 0;
  top: 0;
  transition: 0.2s ease;
}

.solid-switch-toggle-small {
  border-radius: 7px;
}

.solid-switch-toggle.on {
  background-color: var(--cursor-bg-green-primary);
  box-shadow: 0 0 0 1px var(--vscode-contrastBorder);
}

.solid-switch.solid-switch-on-blue .solid-switch-toggle.on {
  background-color: var(--vscode-terminal-ansiBlue);
}

.solid-switch-toggle:before {
  background-color: #fff;
  border-radius: 50%;
  bottom: 2px;
  content: '';
  height: 14px;
  left: 2px;
  position: absolute;
  transition: 0.2s ease;
  width: 14px;
}

.solid-switch-toggle-small:before {
  bottom: 2px;
  height: 10px;
  left: 2px;
  width: 10px;
}

.solid-switch-toggle.on:before {
  transform: translateX(12px);
}

.solid-switch-toggle-small.on:before {
  transform: translateX(10px);
}

/* Tailwind Utilities Replacement */
.flex {
  display: flex;
}
.flex-col {
  flex-direction: column;
}
.items-center {
  align-items: center;
}
.justify-center {
  justify-content: center;
}
.gap-2 {
  gap: 8px;
}
.gap-3 {
  gap: 12px;
}
.rounded-md {
  border-radius: 6px;
}
.rounded-full {
  border-radius: 9999px;
}
.text-xs {
  font-size: 12px;
}
.py-\[3px\] {
  padding-top: 3px;
  padding-bottom: 3px;
}
.w-full {
  width: 100%;
}
.my-2 {
  margin-top: 8px;
  margin-bottom: 8px;
}
</style>
