<template>
  <CollapsibleRoot
    v-bind="forwarded"
    :default-open="defaultOpen"
  >
    <template #default="{ open: rootOpen }">
      <CollapsibleTrigger as-child>
        <slot name="trigger" :open="rootOpen" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <slot :open="rootOpen" />
      </CollapsibleContent>
    </template>
  </CollapsibleRoot>
</template>

<script setup lang="ts">
import {
  CollapsibleRoot,
  CollapsibleTrigger,
  CollapsibleContent,
  useForwardPropsEmits,
} from 'reka-ui'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  open?: boolean
  defaultOpen?: boolean
}>(), {
  open: undefined,
  defaultOpen: false,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const forwarded = useForwardPropsEmits(computed(() => {
  const result: Record<string, any> = {}
  // Only pass open if explicitly controlled
  if (props.open !== undefined) {
    result.open = props.open
  }
  return result
}), emit)
</script>
