/**
 * `claude` subcommands behind the UI-side commands `/plugin`, `/login` and
 * `/logout`: the SDK has no control request for them, so the CLI itself is run
 * (`claude plugin list --json`, `claude auth login`, ...), as a user would in a
 * terminal.
 */

import { execFile } from 'child_process';
import type { CliInvocation } from './ClaudeSdkService';
import type {
    AuthLoginMethod,
    AuthStatusInfo,
    AvailablePluginEntry,
    MarketplaceEntry,
    PluginCommandConfirmation,
    PluginEntry
} from '../../shared/messages';

/** A non-empty string field, else undefined */
const str = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

export interface CliResult {
    code: number;
    stdout: string;
    stderr: string;
}

/** Run `claude <args>` to the end; never rejects for a non-zero exit (see `code`). */
export function runClaudeCli(
    cli: CliInvocation,
    args: string[],
    cwd: string,
    timeoutMs = 30000
): Promise<CliResult> {
    return new Promise((resolve, reject) => {
        execFile(
            cli.command,
            [...cli.prefixArgs, ...args],
            { cwd, env: cli.env, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
            (error, stdout, stderr) => {
                const code = (error as NodeJS.ErrnoException | null)?.code;
                if (error && typeof code === 'string') {
                    // Not started at all (ENOENT ...): a real failure
                    reject(error);
                    return;
                }
                resolve({
                    code: error ? (typeof (error as any).code === 'number' ? (error as any).code : 1) : 0,
                    stdout: String(stdout),
                    stderr: String(stderr)
                });
            }
        );
    });
}

/** What the CLI printed on failure: its stderr, else its stdout, else the exit code */
export function cliError(result: CliResult): string {
    return stripAnsi(result.stderr).trim() || stripAnsi(result.stdout).trim() || `exit code ${result.code}`;
}

export function stripAnsi(text: string): string {
    return text
        // OSC sequences (hyperlinks: ESC ] 8 ;; url BEL)
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
        // CSI sequences (colors, cursor moves)
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
        .replace(/\x1b[@-_]/g, '');
}

/** `claude auth status --json` */
export async function readAuthStatus(cli: CliInvocation, cwd: string): Promise<AuthStatusInfo> {
    const result = await runClaudeCli(cli, ['auth', 'status', '--json'], cwd, 15000);
    let data: any;
    try {
        data = JSON.parse(result.stdout);
    } catch {
        throw new Error(cliError(result));
    }
    return {
        loggedIn: data?.loggedIn === true,
        authMethod: str(data?.authMethod),
        apiProvider: str(data?.apiProvider),
        email: str(data?.email),
        orgName: str(data?.orgName),
        subscriptionType: str(data?.subscriptionType),
        loginExpiresAt: str(data?.loginExpiresAt),
        apiKeySource: str(data?.apiKeySource)
    };
}

/**
 * `claude plugin list --json`: `{ installed: [...] }` (older CLIs: a bare
 * array). Fields are read defensively, the shape is not documented.
 */
export async function listPlugins(cli: CliInvocation, cwd: string): Promise<PluginEntry[]> {
    const result = await runClaudeCli(cli, ['plugin', 'list', '--json'], cwd);
    let data: any;
    try {
        data = JSON.parse(result.stdout);
    } catch {
        throw new Error(cliError(result));
    }
    const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.installed) ? data.installed : [];
    return list
        .map((p): PluginEntry | undefined => {
            const id = str(p?.pluginId) ?? str(p?.id) ?? str(p?.name);
            if (!id) {
                return undefined;
            }
            const enabled = typeof p?.enabled === 'boolean' ? p.enabled
                : typeof p?.isEnabled === 'boolean' ? p.isEnabled
                    : p?.status === 'disabled' ? false : true;
            return {
                id,
                name: str(p?.name) ?? id.split('@')[0],
                marketplace: str(p?.marketplaceName) ?? str(p?.marketplace) ?? (id.includes('@') ? id.split('@')[1] : undefined),
                version: str(p?.version),
                scope: str(p?.scope),
                description: str(p?.description),
                enabled
            };
        })
        .filter((p): p is PluginEntry => !!p);
}

/** `claude plugin list --json --available`: every plugin of the configured marketplaces */
export async function listAvailablePlugins(cli: CliInvocation, cwd: string): Promise<AvailablePluginEntry[]> {
    const result = await runClaudeCli(cli, ['plugin', 'list', '--json', '--available'], cwd, 120000);
    let data: any;
    try {
        data = JSON.parse(result.stdout);
    } catch {
        throw new Error(cliError(result));
    }
    const list: any[] = Array.isArray(data?.available) ? data.available : [];
    return list
        .map((p): AvailablePluginEntry | undefined => {
            const id = str(p?.pluginId) ?? str(p?.id);
            if (!id) {
                return undefined;
            }
            return {
                id,
                name: str(p?.name) ?? id.split('@')[0],
                marketplace: str(p?.marketplaceName) ?? (id.includes('@') ? id.split('@')[1] : undefined),
                description: str(p?.description),
                installCount: typeof p?.installCount === 'number' ? p.installCount : undefined
            };
        })
        .filter((p): p is AvailablePluginEntry => !!p);
}

/** `claude plugin marketplace list --json` */
export async function listMarketplaces(cli: CliInvocation, cwd: string): Promise<MarketplaceEntry[]> {
    const result = await runClaudeCli(cli, ['plugin', 'marketplace', 'list', '--json'], cwd);
    let data: any;
    try {
        data = JSON.parse(result.stdout);
    } catch {
        throw new Error(cliError(result));
    }
    const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.marketplaces) ? data.marketplaces : [];
    return list
        .map((m): MarketplaceEntry | undefined => {
            const name = str(m?.name);
            return name
                ? { name, source: str(m?.source), location: str(m?.repo) ?? str(m?.url) ?? str(m?.path) ?? str(m?.installLocation) }
                : undefined;
        })
        .filter((m): m is MarketplaceEntry => !!m);
}

export interface PluginCommandResult {
    ok: boolean;
    message?: string;
    error?: string;
    /** The CLI stopped at a marketplace-declared command the user has to approve */
    confirm?: PluginCommandConfirmation;
}

/** The last stdout line that parses as a JSON object (what `--json` prints) */
function lastJsonLine(stdout: string): any | undefined {
    const lines = stripAnsi(stdout).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].startsWith('{')) {
            continue;
        }
        try {
            return JSON.parse(lines[i]);
        } catch {
            // not JSON, keep looking
        }
    }
    return undefined;
}

/**
 * A `claude plugin ...` command run with `--json`: its result line says
 * `outcome`, `message` and, for an install that runs a command of the
 * marketplace, `shownCommand` (`{ command, sha256, archiveUrl }`).
 */
export async function runPluginCommand(
    cli: CliInvocation,
    args: string[],
    cwd: string,
    timeoutMs = 60000
): Promise<PluginCommandResult> {
    const result = await runClaudeCli(cli, [...args, '--json'], cwd, timeoutMs);
    const line = lastJsonLine(result.stdout);
    const message = str(line?.message);
    const outcome = str(line?.outcome);
    const ok = result.code === 0 && (outcome === undefined || outcome === 'ok' || line?.alreadyInGoalState === true);
    if (ok) {
        // `marketplace add` prefixes its progress lines ("Cloning repository…")
        return { ok: true, message: message?.split('\n').filter((l) => l.trim()).pop() };
    }
    const shown = line?.shownCommand;
    const sha256 = str(shown?.sha256);
    if (sha256) {
        const command = Array.isArray(shown?.command) ? shown.command.join(' ') : str(shown?.command) ?? '';
        return {
            ok: false,
            error: message,
            confirm: { command: command || JSON.stringify(shown), sha256, archiveUrl: str(shown?.archiveUrl) }
        };
    }
    return { ok: false, error: message ?? cliError(result) };
}

// ============================================================================
// Login: `claude auth login` in a pseudo-terminal
// ============================================================================

type IPtyModule = typeof import('node-pty');
type IPty = ReturnType<IPtyModule['spawn']>;

export interface LoginResult {
    ok: boolean;
    error?: string;
}

/**
 * One `claude auth login` run. The CLI opens the browser itself and prints the
 * sign-in URL ("If the browser didn't open, visit: ..."), then waits for the
 * code at "Paste code here if prompted >" when the browser cannot hand it back.
 * It wants a terminal for that prompt, hence node-pty instead of a pipe.
 */
export class LoginProcess {
    private readonly proc: IPty;
    private output = '';
    private url: string | undefined;
    private finished: LoginResult | undefined;
    private readonly urlWaiters: Array<() => void> = [];
    private readonly doneWaiters: Array<(result: LoginResult) => void> = [];

    constructor(cli: CliInvocation, method: AuthLoginMethod, email: string | undefined, cwd: string) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pty = require('node-pty') as IPtyModule;
        const args = [...cli.prefixArgs, 'auth', 'login'];
        if (method === 'console') args.push('--console');
        else if (method === 'sso') args.push('--sso');
        else args.push('--claudeai');
        if (email) args.push('--email', email);

        // Wide enough that the URL is never wrapped
        this.proc = pty.spawn(cli.command, args, { name: 'xterm-256color', cols: 4000, rows: 30, cwd, env: cli.env });
        this.proc.onData((data) => {
            this.output += data;
            if (this.output.length > 200_000) {
                this.output = this.output.slice(-100_000);
            }
            if (!this.url) {
                const match = /https:\/\/\S+/.exec(stripAnsi(this.output));
                if (match) {
                    this.url = match[0];
                    this.urlWaiters.splice(0).forEach((wake) => wake());
                }
            }
        });
        this.proc.onExit(({ exitCode }) => {
            const text = stripAnsi(this.output).replace(/\r/g, '').trim();
            const lastLines = text.split('\n').filter((l) => l.trim()).slice(-3).join('\n');
            this.finished = exitCode === 0
                ? { ok: true }
                : { ok: false, error: lastLines || `claude auth login exited with code ${exitCode}` };
            this.urlWaiters.splice(0).forEach((wake) => wake());
            this.doneWaiters.splice(0).forEach((resolve) => resolve(this.finished!));
        });
    }

    /** The sign-in URL once printed, or undefined when the process ended first (or timed out) */
    waitForUrl(timeoutMs: number): Promise<string | undefined> {
        if (this.url || this.finished) {
            return Promise.resolve(this.url);
        }
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(this.url), timeoutMs);
            this.urlWaiters.push(() => {
                clearTimeout(timer);
                resolve(this.url);
            });
        });
    }

    get result(): LoginResult | undefined {
        return this.finished;
    }

    wait(): Promise<LoginResult> {
        if (this.finished) {
            return Promise.resolve(this.finished);
        }
        return new Promise((resolve) => this.doneWaiters.push(resolve));
    }

    submitCode(code: string): void {
        if (!this.finished) {
            this.proc.write(`${code.trim()}\r`);
        }
    }

    cancel(): void {
        if (!this.finished) {
            try {
                this.proc.kill();
            } catch {
                // already gone
            }
        }
    }
}
