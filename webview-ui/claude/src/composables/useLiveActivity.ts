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

  function track<T>(read: (activity: LiveActivity) => T, fallback: T): ShallowRef<T> {
    const out = shallowRef<T>(fallback);
    stops.push(
      effect(() => {
        const session = runtime?.sessionStore.activeSession() as Session | undefined;
        out.value = session ? read(session.activity) : fallback;
      })
    );
    return out;
  }

  const result = {
    subagentMessages: track<Record<string, Message[]>>((a) => a.subagentMessages(), {}),
    tasks: track<Record<string, TaskInfo>>((a) => a.tasks(), {}),
    backgroundTasks: track<BackgroundTask[]>((a) => a.backgroundTasks(), []),
    rateLimit: track<RateLimitInfo | undefined>((a) => a.rateLimit(), undefined),
    apiRetry: track<ApiRetryInfo | undefined>((a) => a.apiRetry(), undefined),
    turnTokens: track((a) => a.turnTokens(), 0),
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
