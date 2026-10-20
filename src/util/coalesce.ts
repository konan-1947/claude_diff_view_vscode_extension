export interface Coalesced {
  schedule(): void;
  dispose(): void;
}

/**
 * Runs `fn` once after `waitMs` without a new schedule() call, but no later than
 * `maxWaitMs` after the first pending call, so a long burst of events (an agent
 * writing hundreds of files, issue #37) still refreshes the UI every so often
 * instead of once per event or not at all until it ends.
 */
export function coalesce(fn: () => void, waitMs = 100, maxWaitMs = 500): Coalesced {
  let timer: NodeJS.Timeout | undefined;
  let firstScheduledAt = 0;

  const run = (): void => {
    timer = undefined;
    fn();
  };

  return {
    schedule(): void {
      const now = Date.now();
      if (timer) {
        clearTimeout(timer);
      } else {
        firstScheduledAt = now;
      }
      const delay = Math.max(0, Math.min(waitMs, firstScheduledAt + maxWaitMs - now));
      timer = setTimeout(run, delay);
    },
    dispose(): void {
      if (timer) { clearTimeout(timer); }
      timer = undefined;
    },
  };
}
