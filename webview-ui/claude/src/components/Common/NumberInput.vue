<template>
  <input
    type="number"
    :value="modelValue"
    @change="$emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    class="number-input focus:outline-none outline-none text-center"
    :class="{ 'opacity-50 cursor-not-allowed': disabled }"
    :min="min"
    :max="max"
    :disabled="disabled"
    :style="{ width: width }"
  />
</template>

<script setup lang="ts">
defineProps<{
  modelValue: number;
  min?: number;
  max?: number;
  width?: string;
  disabled?: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', value: number): void;
}>();
</script>

<style scoped>
.number-input {
  padding: 4px 6px;
  box-sizing: border-box;
  font-size: 12px;
  border: 1px solid var(--cursor-stroke-primary);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 6px;
}

/* Hide number input spinners */
.number-input::-webkit-outer-spin-button,
.number-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  appearance: none;
  margin: 0;
}
.number-input {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
