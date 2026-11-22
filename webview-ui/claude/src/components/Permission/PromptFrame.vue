<template>
  <!-- Frame of a prompt that waits on the user (tool permission, question,
       plan approval), drawn above the chat input like the CLI's dialog. It
       never closes on its own: only a choice resolves it. -->
  <div class="prompt-frame" data-permission-panel="1">
    <div class="pf-header">
      <span class="pf-title"><slot name="title">{{ title }}</slot></span>
      <span v-if="$slots.aside" class="pf-aside"><slot name="aside" /></span>
    </div>
    <div class="pf-body">
      <slot />
    </div>
    <div v-if="hint.length" class="pf-hint">
      <span v-for="item in hint" :key="item">{{ item }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title?: string; hint?: string[] }>(), {
  title: '',
  hint: () => [],
})
</script>

<style scoped>
.prompt-frame {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--cs-fg-14, var(--vscode-input-border));
  border-radius: 8px;
  background: var(--vscode-input-background, var(--vscode-editor-background));
  font-size: 12px;
  line-height: 16px;
  color: var(--cs-fg);
}

.pf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 20px;
}

.pf-title {
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
}

.pf-aside {
  flex-shrink: 0;
  color: var(--cs-fg-36);
  font-size: 11px;
}

.pf-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.pf-hint {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 11px;
  color: var(--cs-fg-36);
}
</style>
