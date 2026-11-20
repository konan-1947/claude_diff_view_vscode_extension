<template>
  <Icon
    type="codicon"
    :icon="isDirectory ? 'folder' : 'file'"
    :size="size"
    :class-name="props.className"
  />
</template>

<script setup lang="ts">
import Icon from './Icon.vue';

// Generic file/folder codicon. Upstream picked a per-type icon from ~1,160
// bundled SVGs; that icon set was dropped to keep the repo small.
interface Props {
  fileName: string;
  size?: number | string;
  className?: string;
  isDirectory?: boolean;
  folderPath?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 16
});
</script>
