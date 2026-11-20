<template>
  <SettingsTab title="Agent">
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
  </SettingsTab>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import NumberInput from '../../Common/NumberInput.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';

const { settings, updateSetting } = useSettingsStore();

const cleanupPeriodDays = computed(() => settings.value.cleanupPeriodDays ?? 720);

const updateCleanupPeriod = (value: number) => {
  updateSetting('cleanupPeriodDays', value, 'global');
};
</script>
