<template>
  <SettingsTab title="Hooks">
    <SettingsSection>
      <SettingsCell label="Lifecycle Hooks">
        <template #description> Manage lifecycle hooks (.claude/hooks) </template>
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
