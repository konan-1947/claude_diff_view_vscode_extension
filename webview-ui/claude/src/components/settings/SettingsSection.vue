<template>
  <div class="cursor-settings-section">
    <div v-if="title" class="cursor-settings-section-header">
      <div class="cursor-settings-section-header-leading-items">
        <div class="cursor-settings-section-header-title-row">
          <div class="cursor-settings-section-header-title">{{ title }}</div>
        </div>
      </div>
      <div class="cursor-settings-section-header-trailing-items"></div>
    </div>
    <div class="cursor-settings-section-list">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<style scoped>
.cursor-settings-section {
    align-items: flex-start;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 8px
}

.cursor-settings-section-header {
    align-items: flex-end;
    align-self: stretch;
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 0 8px
}

.cursor-settings-section-header-leading-items {
    align-self: stretch;
    display: flex;
    flex: 1 0 0;
    flex-direction: column;
    gap: 2px
}

.cursor-settings-section-header-title-row {
    align-items: center;
    display: flex;
    gap: 4px
}

.cursor-settings-section-header-title {
    color: var(--cursor-text-secondary);
    font-size: 12px;
    font-weight: 400;
    letter-spacing: .07px;
    line-height: 14px;
    user-select: none
}

.cursor-settings-section-header-description {
    color: var(--cursor-text-tertiary);
    font-size: 12px;
    line-height: 14px;
    margin: 0
}

.cursor-settings-section-header-trailing-items {
    display: flex;
    padding-bottom: 3px
}

.cursor-settings-section-list {
    gap: 12px
}

.cursor-settings-section-list,.cursor-settings-sub-section {
    align-items: flex-start;
    align-self: stretch;
    display: flex;
    flex-direction: column
}

.cursor-settings-sub-section {
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
    padding: 0 8px
}
</style>
