<template>
  <SettingsTab title="Plugins">
    <SettingsSection>
      <SettingsSubSection>
        <div class="coming-soon-container">
          <Badge variant="subtle" size="medium">Coming Soon</Badge>
          <p class="coming-soon-text">
            Discover and manage Claude Code plugins from marketplaces.
          </p>
        </div>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import Badge from '../../Common/Badge.vue';
</script>

<style scoped>
.coming-soon-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 16px;
  color: var(--cursor-text-tertiary);
}

.coming-soon-text {
  font-size: 12px;
  margin: 0;
}
</style>
