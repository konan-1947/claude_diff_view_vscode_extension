<template>
  <SettingsTab title="Profiles">
    <SettingsSection>
      <SettingsSubSection>
        <!-- Create Profile -->
        <SettingsCell>
          <template #label>
            <div class="add-profile-row">
              <TextInput
                v-model="newProfileName"
                placeholder="Add profile name..."
                class="add-profile-input"
                @keydown.enter="handleCreate"
              />
              <Tooltip content="Create profile">
                <button
                  class="add-profile-btn codicon codicon-plus"
                  :disabled="!isValidName"
                  @click="handleCreate"
                />
              </Tooltip>
            </div>
          </template>
        </SettingsCell>

        <div v-if="error" class="text-red-500 text-xs px-4 py-2">
          {{ error }}
        </div>

        <!-- Profile List -->
        <SettingsCell
          v-for="profile in profileList"
          :key="profile.name"
          :divider="true"
          :class="{ 'profile-active-row': profile.isActive }"
        >
          <template #label>
            <div class="profile-label">
              <span>{{ profile.name }}</span>
              <Badge v-if="profile.isActive" variant="success" class="profile-active-badge">
                <span class="codicon codicon-pass-filled" />
                active
              </Badge>
            </div>
          </template>
          <template #description>
            <span class="profile-path">{{ profile.path }}</span>
          </template>
          <template v-if="profile.name !== 'Default'" #trailing>
            <div class="profile-actions">
              <Tooltip content="Edit profile name">
                <button
                  class="profile-action-btn codicon codicon-edit"
                  @click="handleEdit(profile.name)"
                />
              </Tooltip>
              <Tooltip :content="profile.isActive ? 'Cannot delete active profile' : 'Delete profile'">
                <button
                  :class="['profile-action-btn', 'profile-action-btn-danger', 'codicon', 'codicon-trash', { 'profile-action-btn-disabled': profile.isActive }]"
                  :disabled="profile.isActive"
                  @click="handleDelete(profile.name)"
                />
              </Tooltip>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import TextInput from '../../Common/TextInput.vue';
import Badge from '../../Common/Badge.vue';
import Tooltip from '../../Common/Tooltip.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';

const { profiles, activeProfile, createProfile, deleteProfile } = useSettingsStore();

const newProfileName = ref('');
const error = ref('');

const isValidName = computed(() => {
  return newProfileName.value && /^[a-zA-Z0-9_\-]+$/.test(newProfileName.value);
});

const profileList = computed(() => {
  // Current profiles logic: 'Default' isn't in the list from backend, effectively.
  // The backend `profiles` list only contains Custom profiles.
  // We should synthesize a view list.
  const list = [
    {
      name: 'Default',
      path: '~/.claude/settings.json',
      isActive: !activeProfile.value
    }
  ];

  if (profiles.value) {
    profiles.value.forEach((p) => {
      list.push({
        name: p,
        path: `~/.claude/settings.${p}.json`,
        isActive: activeProfile.value === p
      });
    });
  }
  return list;
});

const handleCreate = async () => {
  if (!isValidName.value) return;
  error.value = '';
  try {
    await createProfile(newProfileName.value);
    newProfileName.value = '';
  } catch (e: any) {
    error.value = e.message || 'Failed to create profile';
  }
};

const handleEdit = (name: string) => {
  // TODO: implement profile rename
  console.log('Edit profile:', name);
};

const handleDelete = async (name: string) => {
  error.value = '';
  try {
    await deleteProfile(name);
  } catch (e: any) {
    error.value = e.message || 'Failed to delete profile';
  }
};
</script>

<style scoped>
/* ── Add Profile Row ── */

.add-profile-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.add-profile-input {
  flex: 1;
  min-width: 0;
}

.add-profile-btn {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cursor-icon-secondary);
  font-size: 14px;
  flex-shrink: 0;
  transition: color 0.15s, background-color 0.15s;
}

.add-profile-btn:hover:not(:disabled) {
  background-color: var(--cursor-bg-secondary);
  color: var(--cursor-icon-primary);
}

.add-profile-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ── Active Profile ── */

.profile-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-active-badge {
  gap: 3px;
  color: var(--vscode-terminal-ansiGreen, #89d185);
  background-color: color-mix(in srgb, var(--vscode-terminal-ansiGreen, #89d185) 12%, transparent);
  opacity: 1;
}

.profile-active-badge .codicon {
  font-size: 11px;
}

.profile-path {
  font-size: 11px;
  color: var(--cursor-text-tertiary);
  font-family: var(--vscode-editor-font-family), monospace;
}

/* ── Profile Actions ── */

.profile-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.profile-action-btn {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cursor-icon-tertiary);
  font-size: 13px;
  transition: color 0.15s, background-color 0.15s;
}

.profile-action-btn:hover:not(:disabled) {
  background-color: var(--cursor-bg-secondary);
  color: var(--cursor-icon-primary);
}

.profile-action-btn-danger:hover:not(:disabled) {
  color: var(--cursor-text-red-primary);
}

.profile-action-btn-disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>
