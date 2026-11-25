<template>
  <div class="notice-block">
    <span v-if="block.icon" :class="['codicon', `codicon-${block.icon}`]"></span>
    <span class="notice-message">{{ block.message }}</span>
    <span v-if="block.detail" class="notice-detail">{{ block.detail }}</span>
  </div>
</template>

<script setup lang="ts">
import type { NoticeBlock as NoticeBlockType } from '../../../models/ContentBlock';

interface Props {
  block: NoticeBlockType;
}

defineProps<Props>();
</script>

<style scoped>
/* A centred hairline marker between turns (same placement as InterruptBlock) */
.notice-block {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 2px 0;
  color: color-mix(in srgb, var(--vscode-foreground) 65%, transparent);
  font-size: 12px;
}

.notice-block::before,
.notice-block::after {
  content: '';
  flex: 1;
  max-width: 80px;
  border-top: 1px solid var(--cs-fg-12, var(--vscode-panel-border));
}

.notice-block .codicon {
  font-size: 13px;
  flex-shrink: 0;
}

.notice-detail {
  opacity: 0.8;
}
</style>
