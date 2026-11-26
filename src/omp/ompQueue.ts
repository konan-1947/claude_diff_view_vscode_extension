import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { findOmpSessionFile, parseOmpSession } from './ompSessions';

/**
 * The parts of the OMP UI protocol that need state across frames, kept out of
 * OmpAgentService so they can be unit tested without vscode:
 *
 * - `command_lifecycle` (`started` / `cancelled`): the uic chat app only queues
 *   a prompt sent mid-turn once it has seen one of these (Session.ts,
 *   `lifecycleSupported`), and it needs `started` to move the queued chip into
 *   the chat;
 * - `cancel_queued_prompt`: Esc takes queued prompts back out of omp's queue;
 * - `get_rewind_point`: the transcript entry before a message (its parentId),
 *   for `navigate_tree` when the tab is relaunched;
 * - `rate_limit_event`: omp's `usageLimit`, shaped like the CLI's.
 *
 * One instance per channel (one omp process). omp frames are fed in order;
 * every user message the UI sent is remembered, since omp echoes it back as a
 * `message_start` without the uuid the UI knows it by.
 */
export interface PromptTrackerHost {
  /** Post an SDK-shaped message to the channel's webview stream */
  emit(message: any): void;
  /** omp RPC request (OmpRpcProcess.request) */
  request<T = any>(command: any, timeoutMs?: number): Promise<T>;
  sessionId(): string;
  /**
   * A run ended that no prompt of this process started (a steer sent while
   * omp was idle, a background wake): omp sends no `prompt_result` for it, so
   * the host has to end the UI's turn itself.
   */
  onOrphanRunEnd?(): void;
}

/** A message the UI sent whose `message_start` has not arrived yet */
interface PendingPrompt {
  uuid?: string;
  text: string;
  /** Sent as a steer (omp queued it) rather than as a prompt */
  queued: boolean;
}

interface UserStart {
  uuid?: string;
  text: string;
}

export interface RewindPoint {
  found: boolean;
  parentUuid: string | null;
}

const MAX_PARENT_STEPS = 10000;

export class OmpPromptTracker {
  private pending: PendingPrompt[] = [];
  /** Every `message_start` of a user message, in order (rewind maps uuids to entries) */
  private readonly userStarts: UserStart[] = [];
  private steering: string[] = [];
  private liveSteered = 0;
  private runActive = false;
  private promptInFlight = false;
  /** A `prompt_result` was seen for the current run (do not end its turn twice) */
  private resultSeen = false;
  /** Last `{ stage, resetsAtSec }` emitted as a rate_limit_event; undefined = none yet */
  private usageKey?: string;

  constructor(private readonly host: PromptTrackerHost) {}

  /** omp is running (between `agent_start` and `agent_end`) */
  get running(): boolean {
    return this.runActive;
  }

  /** A user message was sent: as a prompt (queued=false) or as a steer (queued=true) */
  onSent(uuid: string | undefined, text: string, queued: boolean): void {
    this.pending.push({ uuid, text, queued });
    if (!queued) this.promptInFlight = true;
  }

  /** The prompt request failed before any run started: nothing is in flight. */
  onPromptFailed(): void {
    this.promptInFlight = false;
    this.dropUnstartedPrompt();
  }

  /** omp acknowledged the prompt but ran no agent (a local slash command): done. */
  onPromptCompletedLocally(): void {
    this.promptInFlight = false;
    this.dropUnstartedPrompt();
  }

  /**
   * omp refused the prompt because a run was already going: the message now
   * arrives with that run, so it is a steer, not the prompt owning the run.
   */
  requeueAsSteer(): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (!this.pending[i].queued) {
        this.pending[i] = { ...this.pending[i], queued: true };
        break;
      }
    }
    this.promptInFlight = false;
  }

  /** Feed EVERY omp frame (before the translator) */
  onFrame(frame: any): void {
    switch (frame?.type) {
      case 'message_start':
        if (frame.message?.role === 'user') this.onUserMessageStart(frame.message);
        return;
      case 'queue_update':
        this.steering = Array.isArray(frame.steering) ? frame.steering.map((s: any) => String(s)) : [];
        this.liveSteered = typeof frame.liveSteered === 'number' && frame.liveSteered > 0 ? frame.liveSteered : 0;
        return;
      case 'agent_start':
        this.runActive = true;
        this.resultSeen = false;
        return;
      case 'agent_end':
        this.runActive = false;
        // Normal order is agent_end, then prompt_result: a turn no prompt started needs its own result
        if (!this.promptInFlight && !this.resultSeen) this.host.onOrphanRunEnd?.();
        this.resultSeen = false;
        return;
      case 'prompt_result':
        this.promptInFlight = false;
        this.runActive = false;
        this.resultSeen = true;
        // A prompt whose user message never showed up is not in the transcript
        this.dropUnstartedPrompt();
        return;
      default:
        return;
    }
  }

  private onUserMessageStart(message: any): void {
    const text = joinText(message.content);
    const match = this.takePending(text, message.steering === true);
    this.userStarts.push({ uuid: match?.uuid, text });
    if (match?.uuid) this.emitLifecycle(match.uuid, 'started');
  }

  /**
   * The pending message this `message_start` belongs to: by its text, else the
   * oldest one (a prompt before a queued steer, unless this is a steer).
   */
  private takePending(text: string, steering: boolean): PendingPrompt | undefined {
    const wanted = text.trim();
    let index = this.pending.findIndex((p) => p.text.trim() === wanted);
    if (index < 0) {
      if (this.pending.length === 0) return undefined;
      // Fall back by kind: a steer pairs with the oldest queued message, a prompt with the oldest prompt
      index = Math.max(0, this.pending.findIndex((p) => p.queued === steering));
    }
    const [match] = this.pending.splice(index, 1);
    return match;
  }

  /** The run ended: a prompt whose `message_start` never came was never recorded */
  private dropUnstartedPrompt(): void {
    const index = this.pending.findIndex((p) => !p.queued);
    if (index >= 0) this.pending.splice(index, 1);
  }

  private emitLifecycle(uuid: string, state: 'started' | 'cancelled'): void {
    this.host.emit({
      type: 'command_lifecycle',
      command_uuid: uuid,
      state,
      uuid: randomUUID(),
      session_id: this.host.sessionId(),
    });
  }

  /** cancel_queued_prompt: remove a not-yet-started steer from omp's queue */
  async cancelQueued(uuid: string): Promise<boolean> {
    const queued = this.pending.filter((p) => p.queued);
    const entry = queued.find((p) => p.uuid === uuid);
    if (!entry) return false;

    // Live entries are out of reach: look for the text after them only
    let index = this.steering.indexOf(entry.text, this.liveSteered);
    if (index < 0) {
      // omp changed the text: the chip order follows the queue
      index = this.liveSteered + queued.indexOf(entry);
    }
    if (index < this.liveSteered || index >= this.steering.length) return false;
    const chip = this.steering[index];

    try {
      const data = await this.host.request<any>({ type: 'remove_queued_message', message: chip, queue: 'steering' });
      if (!data?.removed) return false;
    } catch {
      return false;
    }
    const at = this.pending.indexOf(entry);
    if (at >= 0) this.pending.splice(at, 1);
    this.emitLifecycle(uuid, 'cancelled');
    return true;
  }

  /** get_rewind_point for a message of this session (a UI uuid or an omp entry id) */
  async rewindPoint(userMessageId: string): Promise<RewindPoint> {
    const entries = await this.entries();
    if (!entries) return { found: false, parentUuid: null };
    const index = this.userStarts.findIndex((s) => s.uuid === userMessageId);
    if (index < 0) return rewindPointFromEntries(entries, userMessageId);
    // The user messages of the transcript are the userStarts ones, in order
    const userEntries = entries.filter((e) => e?.type === 'message' && e.message?.role === 'user');
    const target = userEntries[userEntries.length - (this.userStarts.length - index)];
    if (!target || typeof target.id !== 'string') return { found: false, parentUuid: null };
    return rewindPointFromEntries(entries, target.id);
  }

  private async entries(): Promise<any[] | undefined> {
    try {
      const data = await this.host.request<any>({ type: 'get_entries' });
      return Array.isArray(data?.entries) ? data.entries : undefined;
    } catch {
      return undefined;
    }
  }

  /** Re-read get_state.usageLimit and emit rate_limit_event when it changed */
  async refreshUsageLimit(): Promise<void> {
    let usageLimit: any;
    try {
      const state = await this.host.request<any>({ type: 'get_state' });
      usageLimit = state?.usageLimit;
    } catch {
      return;
    }
    const key = usageLimit
      ? JSON.stringify([usageLimit.stage ?? '', usageLimit.resetsAtSec ?? null])
      : 'none';
    if (key === this.usageKey) return;
    // Nothing was ever shown: an 'allowed' banner has nothing to say
    if (this.usageKey === undefined && !usageLimit) return;
    this.usageKey = key;
    this.host.emit(toRateLimitEvent(usageLimit, this.host.sessionId()));
  }
}

/** Text blocks of an omp user message, joined (the text the UI sent) */
function joinText(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
    .map((block: any) => block.text)
    .join('');
}

/** Pure: rewind point from a list of omp entries for an entry id */
export function rewindPointFromEntries(entries: any[], entryId: string): RewindPoint {
  const byId = new Map<string, any>();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry && typeof entry.id === 'string') byId.set(entry.id, entry);
  }
  const target = byId.get(entryId);
  if (!target || target.type !== 'message' || target.message?.role !== 'user') {
    return { found: false, parentUuid: null };
  }
  let parentId: string | undefined = typeof target.parentId === 'string' ? target.parentId : undefined;
  for (let step = 0; parentId && step < MAX_PARENT_STEPS; step++) {
    const entry = byId.get(parentId);
    if (!entry) break;
    if (entry.type === 'message') return { found: true, parentUuid: entry.id };
    parentId = typeof entry.parentId === 'string' ? entry.parentId : undefined;
  }
  return { found: true, parentUuid: null };
}

/** Session file fallback when no channel runs that session */
export async function rewindPointFromFile(cwd: string, sessionId: string, entryId: string): Promise<RewindPoint> {
  try {
    const file = await findOmpSessionFile(cwd, sessionId);
    if (!file) return { found: false, parentUuid: null };
    return rewindPointFromEntries(parseOmpSession(await fs.readFile(file, 'utf8')), entryId);
  } catch {
    return { found: false, parentUuid: null };
  }
}

/** Pure: omp usageLimit (or undefined) → SDK rate_limit_event */
export function toRateLimitEvent(usageLimit: any, sessionId: string): any {
  const limit = usageLimit && typeof usageLimit === 'object' ? usageLimit : undefined;
  return {
    type: 'rate_limit_event',
    uuid: randomUUID(),
    session_id: sessionId,
    rate_limit_info: limit
      ? { status: 'rejected', resetsAt: typeof limit.resetsAtSec === 'number' ? limit.resetsAtSec : undefined, rateLimitType: undefined }
      : { status: 'allowed' },
  };
}
