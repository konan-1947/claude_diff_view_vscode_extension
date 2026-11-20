<template>
  <div class="cursor-settings-tab">
    <div class="cursor-settings-tab-header">
      <div class="cursor-settings-tab-title">{{ title }}</div>
    </div>
    <div class="cursor-settings-tab-content">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<style scoped>
.cursor-settings-tab {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 48px 0
}

.cursor-settings-tab-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 8px
}

.cursor-settings-tab-title {
    color: var(--cursor-text-primary);
    font-size: 16px;
    font-style: normal;
    font-weight: 500;
    letter-spacing: -.32px;
    line-height: 21px
}

.cursor-settings-tab-description {
    color: var(--cursor-text-secondary);
    font-size: 12px;
    font-style: normal;
    font-weight: 400;
    line-height: 16px
}

.cursor-settings-tab-content {
    display: flex;
    flex-direction: column;
    gap: 30px;
    height: 100%
}
</style>
