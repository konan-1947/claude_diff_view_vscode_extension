<template>
  <div class="usage-card">
    <div class="usage-header">
      <span class="codicon codicon-pulse"></span>
      <span class="usage-title">Usage</span>
      <span v-if="block.plan" class="usage-plan">{{ block.plan }}</span>
    </div>

    <div v-for="(meter, i) in block.meters" :key="`m${i}`" class="usage-meter">
      <div class="meter-row">
        <span class="meter-label">{{ meter.label }}</span>
        <span class="meter-percent" :class="level(meter.percent)">{{ meter.percent }}%</span>
      </div>
      <div class="bar">
        <div class="bar-fill" :class="level(meter.percent)" :style="{ width: width(meter.percent) }"></div>
      </div>
      <div v-if="meter.resets" class="meter-resets">Resets {{ meter.resets }}</div>
    </div>

    <template v-if="block.contributing">
      <div class="usage-divider">
        <span>{{ block.contributing.title }}</span>
      </div>
      <div v-if="block.contributing.caption.length" class="usage-caption">
        <span v-for="(part, i) in block.contributing.caption" :key="i">{{ part }}</span>
      </div>

      <div v-for="(period, i) in block.contributing.periods" :key="`p${i}`" class="usage-period">
        <div class="period-row">
          <span class="period-label">{{ period.label }}</span>
          <span v-for="(stat, j) in period.stats" :key="j" class="period-stat">{{ stat }}</span>
        </div>

        <div v-for="(item, j) in period.items" :key="`i${j}`" class="period-item">
          <div class="item-bar-row">
            <div class="bar bar-thin">
              <div class="bar-fill muted" :style="{ width: width(item.percent) }"></div>
            </div>
            <span class="item-percent">{{ item.percent }}%</span>
          </div>
          <div class="item-text">
            <span>{{ item.text }}</span>
            <span v-if="item.hint" class="item-hint">
              <template v-for="(part, k) in splitCommands(item.hint)" :key="k">
                <code v-if="part.command" class="item-command">{{ part.text }}</code>
                <template v-else>{{ part.text }}</template>
              </template>
            </span>
          </div>
        </div>

        <div v-for="(facet, j) in period.facets" :key="`f${j}`" class="period-facet">
          <span class="facet-label">{{ facet.label }}</span>
          <span v-for="(value, k) in facet.values" :key="k" class="facet-value">{{ value }}</span>
        </div>

        <div v-for="(note, j) in period.notes" :key="`n${j}`" class="usage-note">{{ note }}</div>
      </div>
    </template>

    <div v-for="(note, i) in block.notes" :key="`bn${i}`" class="usage-note">{{ note }}</div>
  </div>
</template>

<script setup lang="ts">
import type { UsageReportBlock as UsageReportBlockType } from '../../../models/ContentBlock';

interface Props {
  block: UsageReportBlockType;
  context?: unknown;
}

defineProps<Props>();

function width(percent: number): string {
  return `${Math.max(0, Math.min(100, percent))}%`;
}

function level(percent: number): string {
  if (percent >= 90) return 'danger';
  if (percent >= 70) return 'warn';
  return '';
}

/** "run /clear" → ["run ", {command "/clear"}] */
function splitCommands(text: string): { text: string; command: boolean }[] {
  return text
    .split(/(\/[a-z][\w-]*)/i)
    .filter(Boolean)
    .map((part) => ({ text: part, command: /^\/[a-z]/i.test(part) }));
}
</script>

<style scoped>
.usage-card {
  margin: 4px 0;
  padding: 10px 12px 12px;
  border: 1px solid var(--cs-fg-12, var(--vscode-panel-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--vscode-foreground) 3%, transparent);
  font-size: 12px;
  color: var(--vscode-foreground);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.usage-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.usage-header .codicon {
  font-size: 14px;
  opacity: 0.8;
}

.usage-title {
  font-weight: 600;
  font-size: 13px;
}

.usage-plan {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
}

.usage-meter {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meter-row,
.item-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meter-label {
  flex: 1;
  min-width: 0;
}

.meter-percent {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.meter-resets {
  font-size: 11px;
  opacity: 0.65;
}

.bar {
  position: relative;
  flex: 1;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
}

.bar-thin {
  height: 4px;
  border-radius: 2px;
}

.bar-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--vscode-progressBar-background, var(--vscode-button-background));
}

.bar-fill.muted {
  background: color-mix(in srgb, var(--vscode-foreground) 45%, transparent);
}

.bar-fill.warn {
  background: var(--vscode-editorWarning-foreground);
}

.bar-fill.danger {
  background: var(--vscode-errorForeground);
}

.meter-percent.warn {
  color: var(--vscode-editorWarning-foreground);
}

.meter-percent.danger {
  color: var(--vscode-errorForeground);
}

.usage-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  opacity: 0.75;
}

.usage-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--cs-fg-12, var(--vscode-panel-border));
}

.usage-caption {
  display: flex;
  flex-wrap: wrap;
  column-gap: 12px;
  margin-top: -6px;
  font-size: 11px;
  opacity: 0.6;
}

.usage-period {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.period-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 12px;
}

.period-label {
  font-weight: 600;
}

.period-stat {
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

.period-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-left: 10px;
}

.item-bar-row .bar {
  max-width: 160px;
}

.item-percent {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.item-text {
  display: flex;
  flex-wrap: wrap;
  column-gap: 10px;
  opacity: 0.85;
}

.item-hint {
  opacity: 0.75;
}

.item-command {
  padding: 0 4px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  background: var(--vscode-textCodeBlock-background);
}

.period-facet {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  padding-left: 10px;
  font-size: 11px;
}

.facet-label {
  opacity: 0.65;
  margin-right: 2px;
}

.facet-value {
  padding: 0 6px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
}

.usage-note {
  opacity: 0.75;
  white-space: pre-wrap;
}
</style>
