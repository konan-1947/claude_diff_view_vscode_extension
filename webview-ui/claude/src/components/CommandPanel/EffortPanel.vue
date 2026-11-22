<template>
  <CommandPanel
    ref="panelRef"
    title="Effort"
    :subtitle="subtitle"
    :actions="actions"
    :hint="['←/→ to adjust', 'Esc to cancel']"
    @cancel="emit('close')"
    @key="onKey"
  >
    <div class="effort-scale" :style="{ '--n': levels.length }">
      <div class="captions">
        <span>Faster</span>
        <span :style="{ gridColumn: levels.length }">Smarter</span>
      </div>

      <!-- Track between the first and last level's centre; knob on the pick -->
      <div class="track" :class="{ auto: isAuto }">
        <div class="rail" />
        <div class="fill" :style="{ width: fillWidth }" />
        <span
          v-for="(level, i) in levels"
          :key="level"
          class="tick"
          :class="{ under: i === index }"
          :style="{ left: centreOf(i) }"
          @mousedown.prevent
          @click="pickIndex(i)"
        />
        <span class="knob" :class="{ auto: isAuto }" :style="{ left: centreOf(index) }" />
      </div>

      <div class="levels">
        <span
          v-for="(level, i) in levels"
          :key="level"
          :class="['level', { active: i === index, auto: isAuto }]"
          @mousedown.prevent
          @click="pickIndex(i)"
        >{{ labelOf(level) }}</span>
      </div>
    </div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CommandPanel, { type CommandPanelAction } from './CommandPanel.vue'

interface Props {
  /** Current level; "auto" = the model's default */
  effortLevel: string
  /** Level "auto" runs at right now (the CLI's applied effort); null/undefined = unknown */
  autoLevel?: string | null
  /** Levels the CLI lists for the model, lowest first (ModelInfo.supportedEffortLevels) */
  levels: string[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /** persist: also save as the model's default (Save / Enter), like the CLI */
  (e: 'select', level: string, persist: boolean): void
  (e: 'close'): void
}>()

const LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
}
const labelOf = (level: string) => LABELS[level] ?? level

const panelRef = ref<InstanceType<typeof CommandPanel>>()

// In "auto" the knob sits, faded, on the level auto runs at (the CLI's applied
// effort; medium until the CLI has answered) and the arrows move from there.
const isAuto = ref(!props.levels.includes(props.effortLevel))

function autoIndex(): number {
  const known = props.autoLevel ? props.levels.indexOf(props.autoLevel) : -1
  return known >= 0 ? known : Math.max(0, props.levels.indexOf('medium'))
}

const index = ref(isAuto.value ? autoIndex() : props.levels.indexOf(props.effortLevel))

// The CLI's answer usually arrives just after the panel opens
watch(
  () => props.autoLevel,
  () => {
    if (isAuto.value) index.value = autoIndex()
  }
)

const subtitle = computed(() =>
  isAuto.value ? `Auto (${labelOf(props.levels[index.value] ?? 'medium')})` : ''
)

const current = computed(() => (isAuto.value ? 'auto' : props.levels[index.value]))

/** Centre of column i, as a share of the scale's width */
function centreOf(i: number): string {
  return `${((i + 0.5) / Math.max(1, props.levels.length)) * 100}%`
}

const fillWidth = computed(() => `${(index.value / Math.max(1, props.levels.length)) * 100}%`)

function move(delta: number) {
  isAuto.value = false
  index.value = Math.min(props.levels.length - 1, Math.max(0, index.value + delta))
}

function pickIndex(i: number) {
  isAuto.value = false
  index.value = i
  panelRef.value?.focus()
}

function useAuto() {
  isAuto.value = true
  index.value = autoIndex()
  panelRef.value?.focus()
}

// The CLI saves neither "auto" (it cannot delete the key) nor "max"
// (session-only): Save then applies to this session only, as the CLI does.
const canSave = computed(() => current.value !== 'auto' && current.value !== 'max')

function save() {
  emit('select', current.value, canSave.value)
  emit('close')
}

function sessionOnly() {
  emit('select', current.value, false)
  emit('close')
}

function onKey(event: KeyboardEvent) {
  const key = event.key
  let handled = true
  if (key === 'ArrowLeft' || key === 'h') move(-1)
  else if (key === 'ArrowRight' || key === 'l') move(1)
  else if (key === 'Home') pickIndex(0)
  else if (key === 'End') pickIndex(props.levels.length - 1)
  else if (key === 'a') useAuto()
  else if (key === 's') sessionOnly()
  else if (key === 'Enter') save()
  else handled = false
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

const actions = computed<CommandPanelAction[]>(() => [
  { label: 'Auto', key: 'A', active: isAuto.value, run: useAuto },
  { label: 'This session', key: 'S', run: sessionOnly },
  canSave.value
    ? { label: 'Save', key: '↵', primary: true, run: save }
    : { label: 'Apply', key: '↵', primary: true, run: save },
])
</script>

<style scoped>
.effort-scale {
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.captions {
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  text-align: center;
  font-size: 11px;
  color: var(--cs-fg-36);
}

.track {
  position: relative;
  height: 14px;
}

/* Rail spans first centre → last centre: half a column in from each side */
.rail,
.fill {
  position: absolute;
  top: 50%;
  height: 2px;
  margin-top: -1px;
  border-radius: 1px;
  left: calc(50% / var(--n));
}

.rail {
  right: calc(50% / var(--n));
  background: var(--cs-fg-12);
}

.fill {
  background: var(--cs-fg-52);
  transition: width var(--cs-duration) ease;
}

.tick {
  position: absolute;
  top: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  border-radius: 50%;
  background: var(--cs-fg-20);
  cursor: pointer;
}

.tick.under {
  opacity: 0;
}

.knob {
  /* Triangle pointing up, sitting on the rail like the CLI's ▲ */
  position: absolute;
  top: 50%;
  width: 12px;
  height: 10px;
  margin: -6px 0 0 -6px;
  background: var(--cs-fg-74);
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  transition: left var(--cs-duration) ease;
  pointer-events: none;
}

/* Auto: same position, faded, so it reads as "decided by the model" */
.track.auto .fill {
  background: var(--cs-fg-20);
}

.knob.auto {
  background: var(--cs-fg-36);
}

.level.active.auto {
  color: var(--cs-fg-74);
  font-weight: 400;
}

.levels {
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  text-align: center;
}

.level {
  color: var(--cs-fg-60);
  cursor: pointer;
  padding: 1px 0;
  border-radius: 4px;
  transition: color var(--cs-duration) ease;
}

.level:hover {
  color: var(--cs-fg);
}

.level.active {
  color: var(--cs-fg);
  font-weight: 500;
}
</style>
