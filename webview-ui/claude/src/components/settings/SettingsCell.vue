<template>
  <div tabindex="-1" :class="['cursor-settings-cell', '!outline-none', hasDescription ? 'cursor-settings-cell-align-top' : 'cursor-settings-cell-align-center']">
    <div v-if="divider" class="cursor-settings-cell-divider"></div>
    <div class="cursor-settings-cell-leading-items">
      <p class="cursor-settings-cell-label" v-if="label || $slots.label || $slots['label-prefix']">
        <slot name="label-prefix"></slot>
        <slot name="label">{{ label }}</slot>
      </p>
      <div v-if="hasDescription" class="cursor-settings-cell-description">
        <slot name="description">{{ description }}</slot>
      </div>
    </div>
    <div class="cursor-settings-cell-trailing-items">
      <slot name="trailing"></slot>
    </div>
    <div class="cursor-settings-cell-bottom-items">
      <slot name="bottom"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = defineProps<{
  label?: string
  description?: string
  divider?: boolean
}>()

const slots = useSlots()

const hasDescription = computed(() => {
  return !!props.description || !!slots.description
})
</script>

<style scoped>
.cursor-settings-cell {
    align-self: stretch;
    display: flex;
    flex-direction: row;
    /* gap: 20px; */
    padding: 12px;
    position: relative;
    flex-wrap: wrap;
}

.cursor-settings-cell-align-top {
    align-items: flex-start;
}

.cursor-settings-cell-align-center {
    align-items: center;
}

.cursor-settings-cell-leading-items {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: 1px;
}

.cursor-settings-cell-label {
    color: var(--cursor-text-primary);
    flex-wrap: wrap;
    font-size: 12px;
    font-style: normal;
    font-weight: 400;
    gap: 4px;
    line-height: 16px;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
}

.cursor-settings-cell-label,
.cursor-settings-cell-label > * {
    align-items: center;
    display: flex;
}

.cursor-settings-help-icon {
    align-items: center;
    border-radius: 4px;
    color: var(--cursor-icon-secondary);
    display: inline-flex;
    font-size: 14px;
    height: 14px;
    justify-content: center;
    width: 14px;
}

.cursor-settings-help-icon:hover {
    color: var(--cursor-icon-primary);
}

.cursor-settings-cell-description {
    color: var(--cursor-text-secondary);
    font-size: 12px;
    font-style: normal;
    font-weight: 400;
    line-height: 16px;
    margin: 0;
    user-select: none;
}

.cursor-settings-cell-trailing-items {
    align-items: center;
    align-self: stretch;
    display: flex;
    flex: 0 0 auto;
    flex-direction: row;
    gap: 8px;
    justify-content: flex-end;
}

.cursor-settings-cell-switch-container {
    align-items: center;
    box-sizing: border-box;
    display: flex;
    height: 18px;
}

.cursor-settings-cell-trailing-items > * {
    justify-content: flex-end;
}

.cursor-settings-cell-bottom-items {
  flex-basis: 100%;
  width: 100%;
}

.cursor-settings-cell-divider {
    background-color: var(--cursor-stroke-tertiary);
    height: 1px;
    left: 12px;
    position: absolute;
    right: 12px;
    top: 0;
}

@media (max-width: 500px) {
    .cursor-settings-cell {
        flex-direction: column;
        gap: 12px;
    }

    .cursor-settings-cell-trailing-items {
        flex: 1 1 100%;
        justify-content: flex-start;
        width: 100%;
    }

    .cursor-settings-layout-main {
        gap: 24px;
        padding: 0 24px;
    }
}
</style>
