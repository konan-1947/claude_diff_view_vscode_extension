import { inject, onUnmounted, shallowRef } from 'vue';
import type { ShallowRef } from 'vue';
import { effect } from 'alien-signals';
import { RuntimeKey } from './runtimeContext';
import type { Session } from '../core/Session';
import type { LiveActivity, TaskInfo, BackgroundTask, RateLimitInfo, ApiRetryInfo } from '../core/LiveActivity';
import type { Message } from '../models/Message';

/**
 * The active session's LiveActivity as Vue refs (subagents, background tasks,
 * turn size, rate limit), following the active session when it changes.
 */
export function useLiveActivity() {
  const runtime = inject(RuntimeKey);
  const stops: Array<() => void> = [];

  function track<T>(read: (session: Session) => T, fallback: T): ShallowRef<T> {
    const out = shallowRef<T>(fallback);
    stops.push(
      effect(() => {
        const session = runtime?.sessionStore.activeSession() as Session | undefined;
        out.value = session ? read(session) : fallback;
      })
    );
    return out;
  }

  const result = {
    subagentMessages: track<Record<string, Message[]>>((s) => s.activity.subagentMessages(), {}),
    tasks: track<Record<string, TaskInfo>>((s) => s.activity.tasks(), {}),
    backgroundTasks: track<BackgroundTask[]>((s) => s.activity.backgroundTasks(), []),
    rateLimit: track<RateLimitInfo | undefined>((s) => s.activity.rateLimit(), undefined),
    apiRetry: track<ApiRetryInfo | undefined>((s) => s.activity.apiRetry(), undefined),
    turnTokens: track((s) => s.activity.turnTokens(), 0),
    /** A turn is running (a card without its result is still live, not cut off) */
    busy: track((s) => s.busy(), false),
    /** Kill a background task; resolves to the CLI's error, if any */
    async stopTask(taskId: string): Promise<string | undefined> {
      const session = runtime?.sessionStore.activeSession() as Session | undefined;
      if (!session) return 'No active session';
      try {
        await session.stopTask(taskId);
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    beginTurn() {
      (runtime?.sessionStore.activeSession() as Session | undefined)?.activity.beginTurn();
    },
  };

  onUnmounted(() => stops.forEach((stop) => stop()));
  return result;
}
