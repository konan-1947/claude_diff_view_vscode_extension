/**
 * Price of re-sending a conversation whose prompt cache expired, for the
 * "Resume this conversation?" prompt in Claude UI tabs.
 *
 * The CLI hands this out itself (get_context_usage → coldResumeQuota), but
 * not to SDK sessions (checked on CLI 2.1.332). This computes the same
 * figure from the same inputs the CLI uses, read where the CLI keeps them:
 *   - its remote config `tengu_amber_tally` (cachedGrowthBookFeatures in the
 *     global config file): minPercent, fiveHourCredits by rate-limit tier,
 *     creditsPerMillionTokens by model;
 *   - the account's rate-limit tier (`rateLimitTier` of the OAuth credentials;
 *     only that field is read, never a token).
 *   percent = tokens / 1e6 × creditsPerMillionTokens[model] × 100 / fiveHourCredits[tier]
 * and `tengu_sequential_cloud`, the CLI's cache keepalive (a 5-minute cache
 * renewed every 30 s for activityWindowMinutes after the last activity).
 * Missing or malformed inputs give "unknown", never a guess.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ColdResumeQuota } from './shared/messages';

/** The CLI's default when tengu_amber_tally has no minPercent */
const DEFAULT_MIN_PERCENT = 5;
/** activityWindowMinutes default of the CLI's keepalive config */
const DEFAULT_KEEPALIVE_WINDOW_MINUTES = 60;
/** Files are read at most this often */
const CACHE_MS = 60_000;

interface CliInputs {
    pricing?: {
        minPercent: number;
        fiveHourCredits: Record<string, number>;
        creditsPerMillionTokens: Record<string, number>;
    };
    tier?: string;
    /** 0: keepalive off; undefined: unknown */
    keepaliveWindowMs?: number;
}

let cached: { at: number; inputs: CliInputs } | undefined;

function configDir(): string | undefined {
    const fromEnv = process.env.CLAUDE_CONFIG_DIR;
    return fromEnv && fromEnv.trim() ? fromEnv : undefined;
}

function readJson(file: string): unknown {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return undefined;
    }
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function positiveNumbers(v: unknown): Record<string, number> | undefined {
    if (!isRecord(v)) return undefined;
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v)) {
        if (typeof n === 'number' && n > 0 && Number.isFinite(n)) out[k] = n;
    }
    return out;
}

function readInputs(): CliInputs {
    const dir = configDir();
    // The CLI's global config: $CLAUDE_CONFIG_DIR/.claude.json, else ~/.claude.json
    const globalConfig = readJson(dir ? path.join(dir, '.claude.json') : path.join(os.homedir(), '.claude.json'));
    const features = isRecord(globalConfig) && isRecord(globalConfig.cachedGrowthBookFeatures)
        ? globalConfig.cachedGrowthBookFeatures
        : undefined;
    const inputs: CliInputs = {};

    const tally = features?.tengu_amber_tally;
    if (isRecord(tally)) {
        const fiveHourCredits = positiveNumbers(tally.fiveHourCredits);
        const creditsPerMillionTokens = positiveNumbers(tally.creditsPerMillionTokens);
        const minPercent = typeof tally.minPercent === 'number' && tally.minPercent >= 1 ? tally.minPercent : DEFAULT_MIN_PERCENT;
        if (fiveHourCredits && creditsPerMillionTokens) {
            inputs.pricing = { minPercent, fiveHourCredits, creditsPerMillionTokens };
        }
    }

    if (features) {
        const keepalive = features.tengu_sequential_cloud;
        if (keepalive === false || keepalive === undefined || keepalive === null) {
            inputs.keepaliveWindowMs = 0;
        } else if (isRecord(keepalive) && keepalive.enabled === true) {
            const minutes = typeof keepalive.activityWindowMinutes === 'number' ? keepalive.activityWindowMinutes : DEFAULT_KEEPALIVE_WINDOW_MINUTES;
            const inFlight = typeof keepalive.inFlightWindowMinutes === 'number' ? keepalive.inFlightWindowMinutes : 0;
            inputs.keepaliveWindowMs = Math.max(minutes, inFlight) * 60_000;
        } else if (isRecord(keepalive)) {
            inputs.keepaliveWindowMs = 0;
        }
    }

    const credentials = readJson(path.join(dir ?? path.join(os.homedir(), '.claude'), '.credentials.json'));
    const oauth = isRecord(credentials) && isRecord(credentials.claudeAiOauth) ? credentials.claudeAiOauth : undefined;
    const tier = oauth?.rateLimitTier ?? (isRecord(globalConfig) && isRecord(globalConfig.oauthAccount) ? globalConfig.oauthAccount.rateLimitTier : undefined);
    if (typeof tier === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(tier)) {
        inputs.tier = tier;
    }
    return inputs;
}

function inputsNow(): CliInputs {
    const now = Date.now();
    if (!cached || now - cached.at > CACHE_MS) {
        cached = { at: now, inputs: readInputs() };
    }
    return cached.inputs;
}

/** Model id as the CLI keys its price table: no `[1m]` suffix, no date */
function priceKey(model: string): string {
    return model.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '').trim().toLowerCase();
}

/** The CLI's coldResumeQuota for `model`, or undefined when an input is missing */
export function computeColdResumeQuota(model: string | undefined): ColdResumeQuota | undefined {
    if (!model || process.env.DISABLE_PROMPT_CACHING) return undefined;
    const { pricing, tier } = inputsNow();
    if (!pricing || !tier) return undefined;
    const credits = pricing.fiveHourCredits[tier];
    const perMillion = pricing.creditsPerMillionTokens[priceKey(model)];
    if (credits === undefined || perMillion === undefined) return undefined;
    return { percentPerMillionTokens: (perMillion * 100) / credits, minPercent: pricing.minPercent };
}

/** How long the CLI's keepalive holds a 5-minute cache after the last activity: 0 = off, undefined = unknown */
export function cacheKeepaliveWindowMs(): number | undefined {
    return inputsNow().keepaliveWindowMs;
}
