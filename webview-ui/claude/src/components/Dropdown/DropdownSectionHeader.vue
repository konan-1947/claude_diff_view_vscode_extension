<template>
  <div class="section-header">
    <slot>{{ text }}</slot>
  </div>
</template>

<script setup lang="ts">
interface Props {
  text?: string
}

withDefaults(defineProps<Props>(), {
  text: ''
})
</script>

<style scoped>
.section-header {
  padding: 4px 12px;
  color: var(--vscode-foreground);
  opacity: 0.5;
  font-size: 12px;
  font-weight: 500;
}
</style>
