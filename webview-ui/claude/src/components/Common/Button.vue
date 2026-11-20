<template>
  <button
    class="cursor-button"
    :class="[
      `cursor-button-${variant}`,
      size === 'small' ? 'cursor-button-small' : '',
      clickable && !disabled ? `cursor-button-${variant}-clickable` : 'cursor-button-not-clickable',
      { disabled }
    ]"
    :disabled="disabled"
    @click="handleClick"
  >
    <slot name="icon"></slot>
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger'
  size?: 'small' | 'medium'
  disabled?: boolean
  clickable?: boolean
}>(), {
  variant: 'primary',
  size: 'medium',
  clickable: true
})

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const handleClick = (event: MouseEvent) => {
  emit('click', event)
}
</script>

<style>
.cursor-button {
    align-items: center;
    border-radius: 5px;
    color: var(--vscode-foreground);
    cursor: pointer;
    display: flex;
    font-size: 12px;
    gap: 4px;
    justify-content: center;
    line-height: 16px;
    padding: 4px 8px;
    border: none;
    background: transparent;
    font-family: inherit;
}

.cursor-button-small {
    font-size: 12px;
    padding: 3px 6px
}

.cursor-button-primary {
    background-color: var(--vscode-button-background)
}

.cursor-button-primary, .cursor-button-primary .codicon {
    color: var(--vscode-button-foreground)
}

.cursor-button-tertiary {
    border: 1px solid var(--cursor-stroke-primary);
    border-radius: 5px;
    color: var(--cursor-text-primary)
}

.cursor-button-primary-clickable.disabled {
    cursor: not-allowed!important;
    opacity: .5
}

.cursor-button-primary-clickable:not(.disabled):hover {
    opacity: .8
}

.cursor-button-tertiary-clickable {
    color: var(--cursor-text-primary)
}

.cursor-button-tertiary-clickable:not(.disabled):hover {
    opacity: .8
}

.cursor-button-secondary-clickable:not(.disabled):hover {
    background-color: var(--vscode-input-background)
}

.cursor-button-secondary {
    background-color: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground)
}

.cursor-button-secondary-clickable:not(.disabled):hover {
    background-color: var(--vscode-button-secondaryHoverBackground)
}

.cursor-button-not-clickable {
    cursor: default!important
}

.cursor-button-not-clickable:hover {
    background-color: transparent!important
}

.cursor-button-danger {
    background-color: var(--vscode-errorForeground)
}

.cursor-button-danger, .cursor-button-danger .codicon {
    color: var(--vscode-button-foreground)
}

.cursor-button-danger-clickable:not(.disabled):hover {
    opacity: .8
}

.cursor-button.tab-focusable:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px
}

.cursor-button.tab-focusable:focus-visible {
    outline: 2px solid var(--vscode-focusBorder);
    outline-offset: -2px
}
</style>
