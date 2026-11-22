<template>
  <div v-if="message" class="rate-limit" :class="{ rejected: info?.status === 'rejected' }">
    <span class="codicon" :class="info?.status === 'rejected' ? 'codicon-error' : 'codicon-warning'"></span>
    <span class="rate-text">{{ message }}</span>
    <span
      v-if="info?.status === 'allowed_warning'"
      class="codicon codicon-close rate-close"
      title="Dismiss"
      @click="dismissedKey = key"
    ></span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { RateLimitInfo } from '../core/LiveActivity';

/**
 * The CLI's rate-limit notice above the input: a warning when a limit is
 * close (`allowed_warning`, with how much is used) and an error once it is
 * reached (`rejected`), each with the time it resets.
 */
const props = defineProps<{ info?: RateLimitInfo }>();
const info = computed(() => props.info);

const LIMIT_NAMES: Record<string, string> = {
  five_hour: '5-hour limit',
  seven_day: 'weekly limit',
  seven_day_opus: 'weekly Opus limit',
  seven_day_sonnet: 'weekly Sonnet limit',
  seven_day_overage_included: 'weekly limit',
  overage: 'extra usage limit',
};

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 30_000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

// A dismissed warning comes back when the limit or its window changes
const dismissedKey = ref('');
const key = computed(() => {
  const i = info.value;
  return i ? `${i.status}:${i.rateLimitType ?? ''}:${i.resetsAt ?? ''}` : '';
});

function formatReset(epochSeconds: number): string {
  const at = new Date(epochSeconds * 1000);
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (at.getTime() - now.value < 20 * 3600 * 1000 && at.getDate() === new Date(now.value).getDate()) {
    return time;
  }
  return `${at.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
}

const message = computed(() => {
  const i = info.value;
  if (!i || i.status === 'allowed') return '';
  if (i.resetsAt && i.resetsAt * 1000 <= now.value) return '';
  if (i.status === 'allowed_warning' && dismissedKey.value === key.value) return '';
  const limit = LIMIT_NAMES[i.rateLimitType ?? ''] ?? 'usage limit';
  const reset = i.resetsAt ? `, resets ${formatReset(i.resetsAt)}` : '';
  if (i.status === 'rejected') {
    return `You've hit your ${limit}${reset}`;
  }
  const used = typeof i.utilization === 'number' ? `${Math.round(i.utilization * 100)}% of ` : 'most of ';
  return `You've used ${used}your ${limit}${reset}`;
});
</script>

<style scoped>
.rate-limit {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--vscode-editorWarning-foreground, var(--vscode-foreground));
  background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 10%, transparent);
}

.rate-limit.rejected {
  color: var(--vscode-errorForeground);
  background: color-mix(in srgb, var(--vscode-errorForeground) 10%, transparent);
}

.rate-limit .codicon {
  flex-shrink: 0;
  font-size: 12px;
}

.rate-text {
  flex: 1 1 auto;
  min-width: 0;
}

.rate-close {
  cursor: pointer;
  opacity: 0.7;
}

.rate-close:hover {
  opacity: 1;
}
</style>
