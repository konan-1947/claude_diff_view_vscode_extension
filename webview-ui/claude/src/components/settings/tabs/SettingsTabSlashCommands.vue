<template>
  <SettingsTab title="Slash Commands">
    <SettingsSection>
      <SettingsCell label="Custom Commands">
        <template #description> Manage custom slash commands (.claude/commands) </template>
        <template #trailing>
          <div class="text-xs text-(--cursor-text-secondary)">Coming Soon</div>
        </template>
      </SettingsCell>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsCell from '../SettingsCell.vue';
</script>
