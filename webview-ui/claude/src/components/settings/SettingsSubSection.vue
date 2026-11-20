<template>
  <div class="cursor-settings-sub-section">
    <div class="cursor-settings-sub-section-list">
      <slot></slot>
    </div>
    <div class="cursor-settings-sub-section-trailing-caption">{{ caption }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  caption?: string
}>()
</script>

<style scoped>
.cursor-settings-sub-section {
    align-items: flex-start;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 8px
}

.cursor-settings-sub-section-list {
    align-self: stretch;
    background-color: var(--cursor-bg-tertiary);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 0
}

.cursor-settings-sub-section-trailing-caption {
    color: var(--cursor-text-tertiary);
    font-size: 12px;
    line-height: 14px;
    padding: 0 8px;
    user-select: none
}
</style>
