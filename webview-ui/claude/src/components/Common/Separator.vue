<template>
  <Separator
    :orientation="orientation"
    :decorative="decorative"
    class="common-separator"
    :class="[
      orientation === 'vertical' ? 'common-separator-vertical' : 'common-separator-horizontal'
    ]"
  />
</template>

<script setup lang="ts">
import { Separator } from 'reka-ui'

withDefaults(defineProps<{
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}>(), {
  orientation: 'horizontal',
  decorative: true,
})
</script>

<style scoped>
.common-separator {
  border: none;
  flex-shrink: 0;
}

.common-separator-horizontal {
  height: 1px;
  width: 100%;
  background-color: var(--cursor-stroke-tertiary);
}

.common-separator-vertical {
  width: 1px;
  height: 100%;
  background-color: var(--cursor-stroke-tertiary);
}
</style>
