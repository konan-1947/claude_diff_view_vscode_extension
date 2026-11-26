<template>
  <div class="spinner" :data-permission-mode="permissionMode">
    <span class="icon" :style="{ fontSize: size + 'px' }">
      <OmpSpinner v-if="isOmp" />
      <template v-else>{{ currentIcon }}</template>
    </span>
    <span class="text">{{ animatedText }}</span>
    <!-- Like the CLI's status line: time spent and tokens of this turn, or the API retry -->
    <span v-if="retryText" class="stats retry">{{ retryText }}</span>
    <span v-else-if="statsText" class="stats">{{ statsText }}</span>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
  import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
  import type { ApiRetryInfo } from '../../core/LiveActivity';
  import { formatDuration, formatTokenCount } from '../../core/LiveActivity';
  import OmpSpinner from '../OmpSpinner.vue';
  import { isOmp } from '../../utils/backend';

  interface Props {
    size?: number;
    permissionMode?: PermissionMode;
    /** When the turn started (epoch ms); shows the time spent */
    startedAt?: number;
    /** Output tokens of the turn so far */
    tokens?: number;
    /** The CLI is waiting to retry a failed API request */
    retry?: ApiRetryInfo;
  }

  const props = withDefaults(defineProps<Props>(), {
    size: 16,
    permissionMode: undefined,
    startedAt: undefined,
    tokens: 0,
    retry: undefined,
  });

  const now = ref(Date.now());
  let clockTimer: any;
  onMounted(() => {
    clockTimer = setInterval(() => { now.value = Date.now(); }, 1000);
  });
  onBeforeUnmount(() => {
    if (clockTimer) clearInterval(clockTimer);
  });

  const statsText = computed(() => {
    const parts: string[] = [];
    if (props.startedAt) parts.push(formatDuration(now.value - props.startedAt));
    if (props.tokens > 0) parts.push(`↓ ${formatTokenCount(props.tokens)} tokens`);
    if (parts.length > 0) parts.push('esc to interrupt');
    return parts.join('   ');
  });

  const retryText = computed(() => {
    const r = props.retry;
    if (!r) return '';
    const wait = Math.max(0, Math.ceil((r.retryAt - now.value) / 1000));
    const status = r.errorStatus ? ` (${r.errorStatus})` : '';
    const when = wait > 0 ? `retrying in ${wait}s` : 'retrying';
    return `API error${status}, ${when}   attempt ${r.attempt}/${r.maxRetries}`;
  });

  const SPINNER_ICONS = ['·', '✢', '*', '✶', '✻', '✽'];
  const ANIMATION_ICONS = [...SPINNER_ICONS, ...[...SPINNER_ICONS].reverse()];
  const VERBS = [
    'Accomplishing', 'Actioning', 'Actualizing', 'Baking', 'Booping', 'Brewing',
    'Calculating', 'Cerebrating', 'Channelling', 'Churning', 'Clauding', 'Coalescing',
    'Cogitating', 'Computing', 'Combobulating', 'Concocting', 'Considering', 'Contemplating',
    'Cooking', 'Crafting', 'Creating', 'Crunching', 'Deciphering', 'Deliberating',
    'Determining', 'Discombobulating', 'Doing', 'Effecting', 'Elucidating', 'Enchanting',
    'Envisioning', 'Finagling', 'Flibbertigibbeting', 'Forging', 'Forming', 'Frolicking',
    'Generating', 'Germinating', 'Hatching', 'Herding', 'Honking', 'Ideating',
    'Imagining', 'Incubating', 'Inferring', 'Manifesting', 'Marinating', 'Meandering',
    'Moseying', 'Mulling', 'Mustering', 'Musing', 'Noodling', 'Percolating',
    'Perusing', 'Philosophising', 'Pontificating', 'Pondering', 'Processing', 'Puttering',
    'Puzzling', 'Reticulating', 'Ruminating', 'Scheming', 'Schlepping', 'Shimmying',
    'Simmering', 'Smooshing', 'Spelunking', 'Spinning', 'Stewing', 'Sussing',
    'Synthesizing', 'Thinking', 'Tinkering', 'Transmuting', 'Unfurling', 'Unravelling',
    'Vibing', 'Wandering', 'Whirring', 'Wibbling', 'Working', 'Wrangling'
  ];
  const MAX_VERB_LENGTH = Math.max(...VERBS.map(v => v.length));

  const iconIndex = ref(0);
  const verb = ref(randomVerb());
  const currentIcon = computed(() => ANIMATION_ICONS[iconIndex.value]);

  let iconTimer: any;
  let verbTimer: any;
  let rafId: number | null = null;

  // Text animation state
  const animatedText = ref(' '.repeat(MAX_VERB_LENGTH + 3));
  const animIndex = ref(0);
  const animTarget = ref(
    padTargetText(verb.value + '...', MAX_VERB_LENGTH + 3)
  );
  let lastTick = 0;
  const stepMs = 40;

  onMounted(() => {
    // OMP tabs: omp's own line, a fixed "Working…" (no verbs, no text animation)
    if (isOmp) {
      animatedText.value = 'Working…';
      return;
    }
    iconTimer = setInterval(() => {
      iconIndex.value = (iconIndex.value + 1) % ANIMATION_ICONS.length;
    }, 120);

    // 2s/3s/5s in turn, then a fixed 5s interval
    const intervals = [2000, 3000, 5000];
    let count = 0;
    const schedule = () => {
      verb.value = randomVerb();
      const next = count < intervals.length ? intervals[count++] : 5000;
      verbTimer = setTimeout(schedule, next);
    };
    verbTimer = setTimeout(schedule, intervals[0]);

    // Trigger the text animation for the first time
    startTextAnimation(verb.value + '...');
  });

  onBeforeUnmount(() => {
    if (iconTimer) clearInterval(iconTimer);
    if (verbTimer) clearTimeout(verbTimer);
    stopTextAnimation();
  });

  function randomVerb(): string {
    return VERBS[Math.floor(Math.random() * VERBS.length)];
  }

  // Restart the text animation when the verb changes
  watch(verb, v => {
    startTextAnimation(v + '...');
  });

  function padTargetText(text: string, width: number): string {
    return text.length >= width ? text : text + ' '.repeat(width - text.length);
  }

  function replaceAt(s: string, index: number, ch: string): string {
    if (index < 0 || index >= s.length) return s;
    return s.slice(0, index) + ch + s.slice(index + 1);
  }

  function randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function transformChar(
    currentChar: string,
    targetChar: string,
    phase: number
  ): string {
    if (targetChar === ' ') return ' ';
    switch (phase) {
      case 3:
        return targetChar;
      case 2:
        return randomChoice(['.', '_', targetChar]);
      case 1:
        return randomChoice(['.', '_', targetChar]);
      case 0:
        return '▌';
      default:
        return currentChar;
    }
  }

  function startTextAnimation(text: string) {
    stopTextAnimation();
    animIndex.value = 0;
    lastTick = 0;
    const width = MAX_VERB_LENGTH + 3;
    animTarget.value = padTargetText(text, width);
    if (animatedText.value.length !== width) {
      animatedText.value = ' '.repeat(width);
    }

    const step = (ts: number) => {
      if (!lastTick) lastTick = ts;
      if (ts - lastTick < stepMs) {
        rafId = requestAnimationFrame(step);
        return;
      }
      lastTick = ts;

      const d = animIndex.value;
      // Done when the scan position passes the target length + 3 steps
      if (d - 3 >= animTarget.value.length) {
        rafId = null;
        return;
      }

      animIndex.value++;
      const prev = animatedText.value;
      let nextStr = prev;
      for (let f = 0; f <= 3; f++) {
        const p = d - f;
        if (p >= 0 && p < animTarget.value.length) {
          nextStr = replaceAt(
            nextStr,
            p,
            transformChar(prev[p], animTarget.value[p], f)
          );
        }
      }
      animatedText.value = nextStr;

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
  }

  function stopTextAnimation() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  const permissionMode = computed(() => props.permissionMode);
  const size = computed(() => props.size);
</script>

<style scoped>
  .spinner {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    color: var(--app-primary-foreground, var(--vscode-foreground));
    padding-left: 24px;
  }
  .icon {
    color: var(--app-spinner-foreground, var(--vscode-descriptionForeground));
    font-family: monospace;
    display: inline-block;
    width: 1.5em;
    text-align: center;
  }
  .spinner[data-permission-mode='acceptEdits'] .icon {
    color: var(--app-primary-foreground, var(--vscode-foreground));
  }
  .spinner[data-permission-mode='plan'] .icon {
    color: var(--vscode-focusBorder, var(--app-button-background));
  }
  .text {
    font-weight: 500;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }
  .stats {
    margin-left: 6px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.75;
    white-space: pre;
  }
  .stats.retry {
    color: var(--vscode-editorWarning-foreground, var(--vscode-descriptionForeground));
    opacity: 1;
  }
</style>
