/**
 * ClaudeSessionService - loading and management of session history
 *
 * Responsibilities:
 * 1. Load session history from the ~/.claude/projects/ directory
 * 2. Parse .jsonl files (one JSON object per line)
 * 3. Organize session messages and generate summaries
 * 4. Support session list queries and message retrieval
 *
 * Dependencies:
 * - ILogService: logging service
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';

export const IClaudeSessionService = createDecorator<IClaudeSessionService>('claudeSessionService');

// ============================================================================
// Type definitions
// ============================================================================

/**
 * Session message type
 */
interface SessionMessage {
    uuid: string;
    sessionId: string;
    parentUuid?: string;
    /** Set on a compact_boundary: the last message before compaction (parentUuid is null there) */
    logicalParentUuid?: string;
    timestamp: string;
    type: "user" | "assistant" | "attachment" | "system" | "summary" | "ai-title" | "custom-title";
    message?: any;
    isMeta?: boolean;
    /** The synthetic summary message written right after a compact_boundary */
    isCompactSummary?: boolean;
    subtype?: string;
    compactMetadata?: { trigger?: string; preTokens?: number; postTokens?: number };
    isSidechain?: boolean;
    leafUuid?: string;
    summary?: string;
    aiTitle?: string;
    customTitle?: string;
    toolUseResult?: any;
    gitBranch?: string;
    cwd?: string;

}

/**
 * Session info
 */
export interface SessionInfo {
    id: string;
    lastModified: number;
    messageCount: number;
    summary: string;
    isSidechain?: boolean;
    worktree?: string;
    isCurrentWorkspace: boolean;
}

/**
 * Session service interface
 */
export interface IClaudeSessionService {
    readonly _serviceBrand: undefined;

    /**
     * List all sessions for a working directory
     */
    listSessions(cwd: string): Promise<SessionInfo[]>;

    /**
     * Get all messages of a session
     */
    getSession(sessionIdOrPath: string, cwd: string): Promise<any[]>;

    /**
     * Transcript entry just before a user message (its parentUuid): where a
     * rewind resumes the conversation. null = it was the first entry.
     */
    getRewindPoint(sessionId: string, userMessageId: string, cwd: string): Promise<{ found: boolean; parentUuid: string | null }>;
}

// ============================================================================
// Path helpers
// ============================================================================

/**
 * Get the Claude config directory
 */
function getConfigDir(): string {
    return process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
}

/**
 * Get the projects history directory
 */
function getProjectsDir(): string {
    return path.join(getConfigDir(), "projects");
}

/**
 * Get the history directory of a specific project
 */
function getProjectHistoryDir(cwd: string): string {
    return path.join(getProjectsDir(), cwd.replace(/[^a-zA-Z0-9]/g, "-"));
}

/**
 * UUID regular expression
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a UUID
 */
function validateSessionId(id: string): string | null {
    return typeof id !== "string" ? null : UUID_REGEX.test(id) ? id : null;
}

/**
 * Read a JSONL file
 */
async function readJSONL(filePath: string): Promise<SessionMessage[]> {
    try {
        const content = await fs.readFile(filePath, "utf8");
        if (!content.trim()) {
            return [];
        }

        return content
            .split("\n")
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(obj => obj !== null) as SessionMessage[];
    } catch {
        return [];
    }
}

/**
 * Convert the message format (for returning to the frontend)
 */
function convertMessage(msg: SessionMessage): any | undefined {
    if (msg.isMeta) {
        return undefined;
    }

    // Epoch ms of the original message, so a reloaded turn shows its real
    // duration and age instead of the moment it was loaded.
    const parsed = Date.parse(msg.timestamp);
    const timestamp = Number.isNaN(parsed) ? undefined : parsed;

    if (msg.type === "user") {
        return {
            type: "user",
            message: msg.message,
            session_id: msg.uuid,
            // Transcript id of the message: what rewind (code and conversation) points at
            uuid: msg.uuid,
            parent_tool_use_id: null,
            toolUseResult: msg.toolUseResult,
            // Same flag the live stream sets on the summary (isSynthetic): not shown
            ...(msg.isCompactSummary ? { isCompactSummary: true } : {}),
            timestamp
        };
    }

    // Shaped like the live SDK message, so history shows the same marker
    if (msg.type === "system" && msg.subtype === "compact_boundary") {
        return {
            type: "system",
            subtype: "compact_boundary",
            compact_metadata: {
                trigger: msg.compactMetadata?.trigger,
                pre_tokens: msg.compactMetadata?.preTokens,
                post_tokens: msg.compactMetadata?.postTokens
            },
            timestamp
        };
    }

    if (msg.type === "assistant") {
        return {
            type: "assistant",
            message: msg.message,
            session_id: msg.uuid,
            parent_tool_use_id: null,
            uuid: msg.message?.id,
            timestamp
        };
    }

    if (msg.type === "system" || msg.type === "attachment") {
        return undefined;
    }

    return undefined;
}

/**
 * Text injected by the CLI rather than typed by the user (slash-command echo,
 * local command output, caveats, system reminders). Never usable as a title.
 */
const SYNTHETIC_PROMPT_REGEX =
    /^\s*(<command-name>|<command-message>|<command-args>|<local-command-|<bash-|<system-reminder>|<ide_|Caveat: The messages below were generated)/;

/**
 * Extract the user-typed text of a message, or "" when there is none
 */
function extractUserText(msg: SessionMessage): string {
    const content = msg.message?.content;
    let text = "";

    if (typeof content === "string") {
        text = content;
    } else if (Array.isArray(content)) {
        // Last text item (earlier ones are usually injected context)
        const textItems = content.filter((item: any) => item.type === "text" && item.text);
        text = textItems.length > 0 ? textItems[textItems.length - 1].text : "";
    }

    return SYNTHETIC_PROMPT_REGEX.test(text) ? "" : text.trim();
}

/**
 * Generate a session summary from the first real user prompt
 */
function generateSummary(messages: SessionMessage[]): string {
    let text = "";

    for (const msg of messages) {
        if (msg.type !== "user" || msg.isMeta || msg.isCompactSummary) {
            continue;
        }
        text = extractUserText(msg);
        if (text) {
            break;
        }
    }

    if (!text) {
        return "No prompt";
    }

    // Strip newlines and truncate
    text = text.replace(/\s*\n\s*/g, " ");
    if (text.length > 45) {
        text = text.slice(0, 45) + "...";
    }

    return text;
}


// ============================================================================
// ClaudeSessionService implementation
// ============================================================================

/**
 * Session data container
 */
interface SessionData {
    sessionMessages: Map<string, Set<string>>;
    messages: Map<string, SessionMessage>;
    summaries: Map<string, string>;
    /** Session name written by the CLI (`custom-title` from /rename wins over `ai-title`), keyed by session id */
    titles: Map<string, string>;
}

/**
 * Load the session history of a project
 */
async function loadProjectData(cwd: string): Promise<SessionData> {
    const projectDir = getProjectHistoryDir(cwd);

    let files: string[];
    try {
        files = await fs.readdir(projectDir);
    } catch {
        return {
            sessionMessages: new Map(),
            messages: new Map(),
            summaries: new Map(),
            titles: new Map()
        };
    }

    const fileStats = await Promise.all(
        files.map(async file => {
            const filePath = path.join(projectDir, file);
            const stat = await fs.stat(filePath);
            return { name: filePath, stat };
        })
    );

    const jsonlFiles = fileStats
        .filter(file => file.stat.isFile() && file.name.endsWith(".jsonl"))
        .sort((a, b) => a.stat.mtime.getTime() - b.stat.mtime.getTime());

    const loadedData = await Promise.all(
        jsonlFiles.map(async file => {
            const sessionId = validateSessionId(path.basename(file.name, ".jsonl"));

            if (!sessionId) {
                return {
                    sessionId,
                    sessionMessages: new Map<string, SessionMessage>(),
                    summaries: new Map<string, string>(),
                    titles: new Map<string, string>()
                };
            }

            const messages = new Map<string, SessionMessage>();
            const summaries = new Map<string, string>();
            let aiTitle: string | undefined;
            let customTitle: string | undefined;

            try {
                for (const msg of await readJSONL(file.name)) {
                    if (
                        msg.type === "user" ||
                        msg.type === "assistant" ||
                        msg.type === "attachment" ||
                        msg.type === "system"
                    ) {
                        messages.set(msg.uuid, msg);
                    } else if (msg.type === "summary" && msg.leafUuid) {
                        summaries.set(msg.leafUuid, msg.summary!);
                    } else if (msg.type === "ai-title" && msg.aiTitle) {
                        aiTitle = msg.aiTitle;
                    } else if (msg.type === "custom-title" && msg.customTitle) {
                        customTitle = msg.customTitle;
                    }
                }
            } catch {
            }

            const titles = new Map<string, string>();
            const title = customTitle || aiTitle;
            if (title) {
                titles.set(sessionId, title);
            }

            return { sessionId, sessionMessages: messages, summaries, titles };
        })
    );

    const sessionMessages = new Map<string, Set<string>>();
    const allMessages = new Map<string, SessionMessage>();
    const allSummaries = new Map<string, string>();

    const allTitles = new Map<string, string>();

    for (const { sessionId, sessionMessages: messages, summaries, titles } of loadedData) {
        if (!sessionId) continue;

        sessionMessages.set(sessionId, new Set(messages.keys()));

        for (const [uuid, msg] of messages.entries()) {
            allMessages.set(uuid, msg);
        }

        for (const [uuid, summary] of summaries.entries()) {
            allSummaries.set(uuid, summary);
        }

        for (const [id, title] of titles.entries()) {
            allTitles.set(id, title);
        }
    }

    return {
        sessionMessages,
        messages: allMessages,
        summaries: allSummaries,
        titles: allTitles
    };
}

/**
 * Get the conversation chains of all sessions
 */
function getTranscripts(data: SessionData): SessionMessage[][] {
    const allMessages = [...data.messages.values()];

    // A compaction links back through logicalParentUuid: the pre-compaction
    // leaf is not a conversation of its own.
    const referencedUuids = new Set(
        allMessages.map(msg => msg.parentUuid ?? msg.logicalParentUuid).filter(Boolean) as string[]
    );

    const rootMessages = allMessages.filter(msg => !referencedUuids.has(msg.uuid));

    return rootMessages
        .map(msg => getTranscript(msg, data))
        .filter(transcript => transcript.length > 0);
}

/**
 * Rebuild the full conversation chain. Crosses compactions (a compact_boundary
 * has no parentUuid, only logicalParentUuid), so a resumed conversation still
 * shows what came before /compact, as the CLI's transcript does.
 */
function getTranscript(message: SessionMessage, data: SessionData): SessionMessage[] {
    const result: SessionMessage[] = [];
    const seen = new Set<string>();
    let current: SessionMessage | undefined = message;

    while (current && !seen.has(current.uuid)) {
        seen.add(current.uuid);
        result.unshift(current);
        const parent: string | undefined = current.parentUuid ?? current.logicalParentUuid;
        current = parent ? data.messages.get(parent) : undefined;
    }

    return result;
}


// ============================================================================
// ClaudeSessionService implementation
// ============================================================================

/**
 * Claude session service implementation
 */
export class ClaudeSessionService implements IClaudeSessionService {
    readonly _serviceBrand: undefined;

    constructor(
        @ILogService private readonly logService: ILogService
    ) {
        this.logService.info('[ClaudeSessionService] Initialized');
    }

    /**
     * List all sessions for a working directory
     */
    async listSessions(cwd: string): Promise<SessionInfo[]> {
        try {
            this.logService.info(`[ClaudeSessionService] Loading session list: ${cwd}`);

            const data = await loadProjectData(cwd);

            const transcripts = getTranscripts(data);

            const sessions = transcripts.map(transcript => {
                const lastMessage = transcript[transcript.length - 1];
                const firstMessage = transcript[0];
                const summary = generateSummary(transcript);

                return {
                    lastModified: new Date(lastMessage.timestamp).getTime(),
                    messageCount: transcript.length,
                    isSidechain: firstMessage.isSidechain,
                    id: lastMessage.sessionId,
                    summary: data.titles.get(lastMessage.sessionId) || data.summaries.get(lastMessage.uuid) || summary,
                    isCurrentWorkspace: true
                };
            });

            this.logService.info(`[ClaudeSessionService] Found ${sessions.length} session(s)`);
            return sessions;
        } catch (error) {
            this.logService.error(`[ClaudeSessionService] Failed to load session list:`, error);
            return [];
        }
    }

    /**
     * Get all messages of a session
     */
    async getSession(sessionIdOrPath: string, cwd: string): Promise<any[]> {
        try {
            this.logService.info(`[ClaudeSessionService] Getting session messages: ${sessionIdOrPath}`);

            if (sessionIdOrPath.endsWith(".jsonl")) {
                const messages: any[] = [];
                for (const msg of await readJSONL(sessionIdOrPath)) {
                    messages.push(msg);
                }
                return messages;
            }

            const data = await loadProjectData(cwd);

            const messageUuids = data.sessionMessages.get(sessionIdOrPath);
            if (!messageUuids) {
                return [];
            }

            const sessionMessageList = Array.from(data.messages.values())
                .filter(msg => messageUuids.has(msg.uuid))
                .sort((a, b) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                );

            const latestMessage = sessionMessageList[0];
            if (!latestMessage) {
                return [];
            }

            const result = getTranscript(latestMessage, data)
                .map(convertMessage)
                .filter(msg => !!msg);

            this.logService.info(`[ClaudeSessionService] Got ${result.length} message(s)`);
            return result;
        } catch (error) {
            this.logService.error(`[ClaudeSessionService] Failed to get session messages:`, error);
            return [];
        }
    }

    async getRewindPoint(sessionId: string, userMessageId: string, cwd: string): Promise<{ found: boolean; parentUuid: string | null }> {
        const id = validateSessionId(sessionId);
        if (!id) {
            return { found: false, parentUuid: null };
        }
        const entries = await readJSONL(path.join(getProjectHistoryDir(cwd), `${id}.jsonl`));
        const entry = entries.find(msg => msg.uuid === userMessageId);
        if (!entry) {
            return { found: false, parentUuid: null };
        }
        return { found: true, parentUuid: entry.parentUuid ?? null };
    }

}
