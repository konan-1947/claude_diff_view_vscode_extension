/**
 * `/usage` output, parsed from the CLI's plain text (2.1.327):
 *
 *   You are currently using your subscription to power your Claude Code usage
 *
 *   Current week (all models): 63% used · resets Nov 26, 4pm (Asia/Ho_Chi_Minh)
 *
 *   What's contributing to your usage?
 *   Approximate · sessions on this machine only · shares overlap
 *
 *   Last 24h · 1199 requests · 35 sessions
 *     58%  Start fresh when you switch tasks · run /clear
 *     Top subagents: general-purpose 3%, Explore 1%
 *
 * Lines that match nothing are kept as notes, so a format change degrades
 * to plain text instead of losing information.
 */

export interface UsageMeter {
  label: string;
  percent: number;
  resets?: string;
}

export interface UsageItem {
  percent: number;
  text: string;
  /** Trailing hint, e.g. "run /clear" */
  hint?: string;
}

export interface UsageFacet {
  label: string;
  values: string[];
}

export interface UsagePeriod {
  label: string;
  stats: string[];
  items: UsageItem[];
  facets: UsageFacet[];
  notes: string[];
}

export interface UsageReportBlock {
  type: 'usage_report';
  /** "Subscription", "API usage billing"… from the first line */
  plan?: string;
  meters: UsageMeter[];
  contributing?: {
    title: string;
    caption: string[];
    periods: UsagePeriod[];
  };
  notes: string[];
}

const SEP = /\s+·\s+/;
const PLAN_LINE = /^You are currently using (?:your )?(.+?) to power your Claude Code usage\.?$/i;
const METER_LINE = /^(.+?):\s*(\d+(?:\.\d+)?)%\s+used(?:\s+·\s+resets\s+(.+))?$/i;
const CONTRIB_LINE = /^What's contributing to your usage\??$/i;
const PERIOD_LINE = /^(Last\s+\S+|This\s+\S+|Today)\s+·\s+(.+)$/i;
const ITEM_LINE = /^(\d+(?:\.\d+)?)%\s+(.+)$/;
const FACET_LINE = /^([^:]{1,40}):\s+(.+)$/;

export function looksLikeUsageReport(text: string): boolean {
  return /currently using .+ to power your Claude Code usage|What's contributing to your usage\?/i.test(text);
}

export function parseUsageReport(text: string): UsageReportBlock | undefined {
  if (!looksLikeUsageReport(text)) return undefined;

  const block: UsageReportBlock = { type: 'usage_report', meters: [], notes: [] };
  let period: UsagePeriod | undefined;
  let afterContribTitle = false;

  for (const rawLine of text.split('\n')) {
    const indented = /^\s+\S/.test(rawLine);
    const line = rawLine.trim();
    if (!line) {
      afterContribTitle = false;
      continue;
    }

    if (indented && period) {
      const item = line.match(ITEM_LINE);
      if (item) {
        const [text, ...hint] = item[2].split(SEP);
        period.items.push({ percent: Number(item[1]), text, hint: hint.join('  ') || undefined });
        continue;
      }
      const facet = line.match(FACET_LINE);
      if (facet) {
        period.facets.push({ label: facet[1], values: facet[2].split(/,\s*/) });
        continue;
      }
      period.notes.push(line);
      continue;
    }

    period = undefined;

    const plan = line.match(PLAN_LINE);
    if (plan) {
      block.plan = plan[1].charAt(0).toUpperCase() + plan[1].slice(1);
      continue;
    }
    const meter = line.match(METER_LINE);
    if (meter) {
      block.meters.push({ label: meter[1], percent: Number(meter[2]), resets: meter[3] });
      continue;
    }
    if (CONTRIB_LINE.test(line)) {
      block.contributing = { title: "What's contributing", caption: [], periods: [] };
      afterContribTitle = true;
      continue;
    }
    if (afterContribTitle && block.contributing) {
      block.contributing.caption.push(...line.split(SEP));
      afterContribTitle = false;
      continue;
    }
    const p = line.match(PERIOD_LINE);
    if (p) {
      if (!block.contributing) {
        block.contributing = { title: "What's contributing", caption: [], periods: [] };
      }
      period = { label: p[1], stats: p[2].split(SEP), items: [], facets: [], notes: [] };
      block.contributing.periods.push(period);
      continue;
    }
    block.notes.push(line);
  }

  if (!block.plan && block.meters.length === 0 && !block.contributing) return undefined;
  return block;
}
