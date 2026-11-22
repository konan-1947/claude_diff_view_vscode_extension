import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Current values of the CLI's `/config` keys. The CLI prints no values (bare
 * `/config` only lists keys), so this mirrors where its /config panel reads
 * each one, taken from Claude Code 2.1.327:
 *   - `settings`: merged settings (`getSettings().effective`, the CLI's `r?.x`)
 *   - `global`:   global config `~/.claude.json` (the CLI's `i.x`), with the
 *                 CLI's defaults for keys it has not written yet
 * The value after `??` is the CLI's default. A key missing here (added by a
 * newer CLI) shows no value; its row still works.
 */
type Reader = (settings: Record<string, any>, global: Record<string, any>) => unknown;

const fromGlobal = (key: string, fallback: unknown): Reader => (_s, g) => g[key] ?? fallback;
const fromSettings = (key: string, fallback: unknown): Reader => (s) => s[key] ?? fallback;
/** Settings the CLI stores only when turned off (`x: e ? undefined : false`) */
const offOnly = (key: string): Reader => (s) => s[key] !== false;

const READERS: Record<string, Reader> = {
    // Global config
    autoCompact: fromGlobal('autoCompactEnabled', true),
    autoConnectIde: fromGlobal('autoConnectIde', false),
    autoScroll: fromGlobal('autoScrollEnabled', true),
    checkpoints: fromGlobal('fileCheckpointingEnabled', true),
    copyFullResponse: fromGlobal('copyFullResponse', false),
    copyOnSelect: fromGlobal('copyOnSelect', true),
    defaultToAgentsView: fromGlobal('defaultToAgentsView', false),
    leftArrowOpensAgents: fromGlobal('leftArrowOpensAgents', true),
    editor: (_s, g) => (g.editorMode === 'emacs' ? 'normal' : g.editorMode || 'normal'),
    externalEditorContext: fromGlobal('externalEditorContext', false),
    gitignore: fromGlobal('respectGitignore', true),
    notifChannel: fromGlobal('preferredNotifChannel', 'auto'),
    prStatus: fromGlobal('prStatusFooterEnabled', true),
    progressBar: fromGlobal('terminalProgressBarEnabled', true),
    turnDuration: fromGlobal('showTurnDuration', true),
    verbose: fromGlobal('verbose', false),
    // Defaults decided server-side: unknown unless set
    workflowSizeGuideline: (_s, g) => g.workflowSizeGuideline,
    // `/config theme=…` writes settings; older installs kept it in the global config
    theme: (s, g) => s.theme ?? g.theme ?? 'dark',

    // Settings
    idleCompaction: fromSettings('idleCompaction', true),
    // Unset = the CLI's default; `/config language=default` also resets it
    language: (s) => s.language ?? 'default',
    tips: fromSettings('spinnerTipsEnabled', true),
    reduceMotion: fromSettings('prefersReducedMotion', false),
    switchModelsOnFlag: (s) =>
        s.switchModelsOnFlag === true ? 'Switch automatically'
            : s.switchModelsOnFlag === false ? 'Ask each time'
                : undefined,
    timeFormat: fromSettings('timeFormat', 'auto'),
    useAutoModeDuringPlan: fromSettings('useAutoModeDuringPlan', true),
    workflowKeywordTriggerEnabled: offOnly('workflowKeywordTriggerEnabled'),
    // Default depends on a server-side flag: unknown unless set
    workflows: (s) => (s.disableWorkflows === true ? false : s.enableWorkflows),
    worktreeBaseRef: (s) => s.worktree?.baseRef ?? 'fresh',
    recap: offOnly('awaySummaryEnabled'),
    thinking: offOnly('alwaysThinkingEnabled'),
    permissionMode: (s) => s.permissions?.defaultMode ?? 'default',
    outputStyle: fromSettings('outputStyle', 'default'),
    model: fromSettings('model', 'default'),
};

/** The CLI's global config file (`$CLAUDE_CONFIG_DIR/.claude.json`, else `~/.claude.json`) */
function readGlobalConfig(env: Record<string, string | undefined>): Record<string, any> {
    const dir = env.CLAUDE_CONFIG_DIR;
    const file = dir ? path.join(dir, '.claude.json') : path.join(os.homedir(), '.claude.json');
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * `/config checkpoints` (on unless turned off): the SDK only keeps file
 * checkpoints for rewind when asked to, so the UI follows the CLI's switch.
 */
export function fileCheckpointingEnabled(env: Record<string, string | undefined> = process.env): boolean {
    return readGlobalConfig(env).fileCheckpointingEnabled !== false;
}

/**
 * Current value of each key in `keys` that can be read, as the text
 * `/config key=value` takes (`true`/`false` for switches).
 */
export function readConfigValues(
    keys: string[],
    effectiveSettings: Record<string, any> | undefined,
    env: Record<string, string | undefined> = process.env
): Record<string, string> {
    const settings = effectiveSettings ?? {};
    const global = readGlobalConfig(env);
    const values: Record<string, string> = {};
    for (const key of keys) {
        const reader = READERS[key];
        if (!reader) {
            continue;
        }
        const value = reader(settings, global);
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            values[key] = String(value);
        }
    }
    return values;
}
