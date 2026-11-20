<template>
  <SettingsTab title="Memory and Rules">
    <!-- CLAUDE.md Files Section -->
    <SettingsSection title="Memory Files (CLAUDE.md)">
      <SettingsSubSection>
        <SettingsCell label="User Memory" description="Personal instructions loaded for all projects">
          <template #trailing>
            <Button variant="tertiary" size="small" @click="openConfigFile('user-claude-md')">
              <span class="codicon codicon-edit" style="font-size: 12px; margin-right: 4px"></span>
              Edit
            </Button>
          </template>
          <template #bottom>
            <div class="text-xs text-(--cursor-text-tertiary) mt-1">
              <code>~/.claude/CLAUDE.md</code>
            </div>
          </template>
        </SettingsCell>

        <SettingsCell label="Project Memory" description="Project-specific instructions shared with team" :divider="true">
          <template #trailing>
            <Button variant="tertiary" size="small" @click="openConfigFile('project-claude-md')">
              <span class="codicon codicon-edit" style="font-size: 12px; margin-right: 4px"></span>
              Edit
            </Button>
          </template>
          <template #bottom>
            <div class="text-xs text-(--cursor-text-tertiary) mt-1">
              <code>.claude/CLAUDE.md</code> (checked into source control)
            </div>
          </template>
        </SettingsCell>

        <SettingsCell label="Local Project Memory" description="Personal project-specific instructions (not committed)" :divider="true">
          <template #trailing>
            <Button variant="tertiary" size="small" @click="openConfigFile('local-claude-md')">
              <span class="codicon codicon-edit" style="font-size: 12px; margin-right: 4px"></span>
              Edit
            </Button>
          </template>
          <template #bottom>
            <div class="text-xs text-(--cursor-text-tertiary) mt-1">
              <code>.claude/CLAUDE.local.md</code> (git ignored)
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Custom Agents Section -->
    <SettingsSection title="Custom Agents">
      <SettingsSubSection>
        <SettingsCell label="User Agents" description="Personal subagents available across all projects">
          <template #trailing>
            <Button variant="tertiary" size="small" @click="openConfigFile('user-agents')">
              <span class="codicon codicon-folder-opened" style="font-size: 12px; margin-right: 4px"></span>
              Open
            </Button>
          </template>
          <template #bottom>
            <div class="text-xs text-(--cursor-text-tertiary) mt-1">
              <code>~/.claude/agents/</code>
            </div>
          </template>
        </SettingsCell>

        <SettingsCell label="Project Agents" description="Project-specific subagents shared with team" :divider="true">
          <template #trailing>
            <Button variant="tertiary" size="small" @click="openConfigFile('project-agents')">
              <span class="codicon codicon-folder-opened" style="font-size: 12px; margin-right: 4px"></span>
              Open
            </Button>
          </template>
          <template #bottom>
            <div class="text-xs text-(--cursor-text-tertiary) mt-1">
              <code>.claude/agents/</code>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Company Announcements Section -->
    <SettingsSection title="Company Announcements">
      <SettingsSubSection>
        <SettingsCell label="Announcements" description="Messages displayed to users at startup (managed in settings.json)">
          <template #bottom>
            <div class="flex flex-wrap gap-2 mt-2">
              <div
                v-for="(announcement, index) in announcements"
                :key="index"
                class="flex items-start gap-2 p-2 bg-(--cursor-bg-tertiary) rounded text-xs w-full"
              >
                <span class="flex-1">{{ announcement }}</span>
                <button
                  class="hover:text-(--cursor-text-red-primary) transition-colors flex-shrink-0"
                  @click="removeAnnouncement(index)"
                >
                  <span class="codicon codicon-close"></span>
                </button>
              </div>
              <TextInput
                v-model="newAnnouncement"
                placeholder="Add announcement..."
                class="w-full"
                @keydown.enter="addAnnouncement"
              />
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import Button from '../../Common/Button.vue';
import TextInput from '../../Common/TextInput.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';
import { transport } from '../../../core/runtimeTransport';

const { settings, updateSetting } = useSettingsStore();

const announcements = ref<string[]>([]);
const newAnnouncement = ref('');

onMounted(() => {
  announcements.value = settings.value?.companyAnnouncements || [];
});

const openConfigFile = (configType: string) => {
  transport.openConfigFile(configType);
};

const addAnnouncement = () => {
  const text = newAnnouncement.value.trim();
  if (text && !announcements.value.includes(text)) {
    announcements.value.push(text);
    newAnnouncement.value = '';
    updateSetting('companyAnnouncements', announcements.value, 'global');
  }
};

const removeAnnouncement = (index: number) => {
  announcements.value.splice(index, 1);
  updateSetting('companyAnnouncements', announcements.value, 'global');
};
</script>

<style scoped>
/* TextInput handles all styling via Common/TextInput.vue */
</style>
