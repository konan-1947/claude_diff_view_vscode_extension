<template>
  <!-- OMP tabs: omp's own spinner (its "activity" braille frames), coloured from the
       violet-to-blue half of its mark's gradient -->
  <span class="omp-spinner" :style="{ color: COLORS[colorIndex] }" aria-hidden="true">{{ FRAMES[frame % FRAMES.length] }}</span>
</template>

<script lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
/** Violet → blue, the colours of the mark's right leg (OmpMark.vue) */
const COLORS = ['#9362f4', '#9e60ef', '#8a69f2', '#7f72f2', '#727ef0', '#5a91ee', '#4d9cec', '#35afea', '#28bae8'];
/** There and back, so the colour never jumps */
const COLOR_CYCLE = [...COLORS.keys(), ...[...COLORS.keys()].reverse().slice(1, -1)];

// One clock for every spinner on the page: they turn in step, and one timer runs
const tick = ref(0);
let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function acquire() {
  if (users++ === 0) timer = setInterval(() => { tick.value++; }, 80);
}
function release() {
  if (--users === 0 && timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
</script>

<script setup lang="ts">
onMounted(acquire);
onBeforeUnmount(release);

const frame = computed(() => tick.value);
// The colour moves at a third of the frame rate
const colorIndex = computed(() => COLOR_CYCLE[Math.floor(tick.value / 3) % COLOR_CYCLE.length]);
</script>

<style scoped>
.omp-spinner {
  display: inline-block;
  width: 1em;
  text-align: center;
  font-family: var(--vscode-editor-font-family, monospace);
  line-height: 1;
}
</style>
