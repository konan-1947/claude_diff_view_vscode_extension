import { signal, computed, effect } from 'alien-signals';
import { EventEmitter } from '../utils/events';
import type { ConnectionManager } from './ConnectionManager';
import { Session, type SessionContext, type SessionOptions } from './Session';
import type { PermissionRequest } from './PermissionRequest';
import type { SessionSummary } from './types';
import { isOmp } from '../utils/backend';

const LIST_SESSIONS_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export interface PermissionEvent {
  session: Session;
  permissionRequest: PermissionRequest;
}

/** A conversation the user asked to open that another Claude UI tab already has */
export interface OpenConflict {
  session: Session;
  owner: { tabId: string; title: string };
}

export class SessionStore {
  readonly sessions = signal<Session[]>([]);
  readonly activeSession = signal<Session | undefined>(undefined);
  readonly permissionRequested = new EventEmitter<PermissionEvent>();
  /** Set while ChatPage asks what to do about an OpenConflict */
  readonly openConflict = signal<OpenConflict | undefined>(undefined);

  readonly sessionsByLastModified = computed(() =>
    [...this.sessions()].sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime())
  );

  readonly connectionState = computed(() => this.connectionManager.state());

  private currentConnectionPromise?: Promise<void>;
  private effectCleanups: Array<() => void> = [];

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly context: SessionContext
  ) {
    this.effectCleanups.push(
      effect(() => {
        if (this.connectionManager.connection()) {
          this.listSessions().catch((e) => console.warn('[SessionStore] session list failed', e));
        }
      })
    );

    this.effectCleanups.push(
      effect(() => {
        const session = this.activeSession();
        // Same fallback as the host's CHAT_TITLE_FALLBACK (terminalSessions.ts)
        const defaultTitle = isOmp ? 'OMP' : 'Claude Code';

        if (!session) {
          this.context.renameTab?.(defaultTitle);
          return;
        }

        if (session.isOffline()) {
          session.loadFromServer();
        } else {
          session.preloadConnection();
        }

        // An about:srcdoc iframe (Claude UI tab) cannot rewrite its URL: replaceState throws.
        try {
          const url = new URL(window.location.toString());
          if (session.sessionId()) {
            url.searchParams.set('session', session.sessionId()!);
          } else {
            url.searchParams.delete('session');
          }
          window.history.replaceState({}, '', url.toString());
        } catch {
          // Not needed in a Claude UI tab: the host keeps the session id for restore.
        }

        const summary = session.summary();
        const title = summary && summary.length > 25 ? `${summary.slice(0, 24)}…` : summary;
        this.context.renameTab?.(title || defaultTitle);
      })
    );

    this.effectCleanups.push(
      effect(() => {
        const sessions = this.sessions();
        const seen = new Map<string, Session>();
        const deduped: Session[] = [];
        let changed = false;

        for (const session of sessions) {
          const id = session.sessionId();
          if (!id) {
            deduped.push(session);
            continue;
          }

          const duplicate = seen.get(id);
          if (duplicate && duplicate !== session) {
            // Keep the copy that holds the conversation (shown, running, with its
            // transcript), not whichever sorts first: a history entry for the same
            // id (newer file time) used to win over the live tab, which then
            // showed a reloaded transcript while its CLI process ran on unseen.
            const [keep, drop] = this.liveness(session) > this.liveness(duplicate)
              ? [session, duplicate]
              : [duplicate, session];
            this.mergeSessionMetadata(keep, drop);
            if (this.activeSession() === drop) {
              this.activeSession(keep);
            }
            if (keep === session) {
              deduped[deduped.indexOf(duplicate)] = session;
              seen.set(id, session);
            }
            changed = true;
            continue;
          }

          seen.set(id, session);
          deduped.push(session);
        }

        if (changed) {
          this.sessions([...deduped].sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime()));
        }
      })
    );
  }

  onPermissionRequested(callback: (event: PermissionEvent) => void): () => void {
    return this.permissionRequested.add(callback);
  }

  async getConnection() {
    return this.connectionManager.get();
  }

  async createSession(options: SessionOptions = {}): Promise<Session> {
    const session = new Session(() => this.getConnection(), this.context, options);

    this.sessions([session, ...this.sessions()]);
    this.activeSession(session);

    this.attachPermissionListener(session);

    return session;
  }

  async listSessions(): Promise<void> {
    if (this.currentConnectionPromise) {
      return this.currentConnectionPromise;
    }

    this.currentConnectionPromise = (async () => {
      try {
        const connection = await this.getConnection();
        // An unanswered request must not keep the history page (and every later
        // call, which reuses this promise) on "Loading…" forever.
        const response = await withTimeout(
          connection.listSessions(),
          LIST_SESSIONS_TIMEOUT_MS,
          'Timed out loading chat history'
        );

        const existing = new Map(
          this.sessions()
            .filter((session) => !!session.sessionId())
            .map((session) => [session.sessionId() as string, session])
        );

        for (const summary of response.sessions ?? []) {
          if (!summary.isCurrentWorkspace) {
            continue;
          }

          const existingSession = existing.get(summary.id);
          if (existingSession) {
            existingSession.lastModifiedTime(summary.lastModified);
            existingSession.summary(summary.summary);
            existingSession.worktree(summary.worktree);
            existingSession.messageCount(summary.messageCount ?? 0);
            continue;
          }

          const session = Session.fromServer(
            summary as SessionSummary,
            () => this.getConnection(),
            this.context
          );

          this.attachPermissionListener(session);
          this.sessions([...this.sessions(), session]);
        }

        this.sessions(
          [...this.sessions()].sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime())
        );
      } finally {
        this.currentConnectionPromise = undefined;
      }
    })();

    await this.currentConnectionPromise;
  }

  setActiveSession(session: Session | undefined): void {
    this.activeSession(session);
  }

  /**
   * Open a conversation from history in this tab (`/resume`, the history page,
   * "Continue last conversation"). If another tab already has it, nothing
   * opens: `openConflict` is set and ChatPage asks the user (switch to that
   * tab, open a fork here, or cancel). A failed check opens it anyway.
   */
  async openExisting(session: Session): Promise<void> {
    this.openConflict(undefined);
    if (session === this.activeSession()) return;
    const id = session.sessionId();
    if (id) {
      try {
        const connection = await this.getConnection();
        const owner = await connection.getSessionOwner(id);
        if (owner) {
          this.openConflict({ session, owner });
          return;
        }
      } catch (e) {
        console.warn('[SessionStore] session owner check failed', e);
      }
    }
    this.activeSession(session);
  }

  /**
   * The conflicting conversation as a copy in this tab: the same history,
   * resumed with `forkSession` so the CLI gives it its own id (the original,
   * in the other tab, is not written to).
   */
  openFork(source: Session): Session {
    const id = source.sessionId();
    const fork = id
      ? this.forkConversation(id, source.summary() ? `${source.summary()} (fork)` : undefined)
      : undefined;
    return fork ?? source;
  }

  /**
   * Open a copy of conversation `sessionId` in this tab (`/branch`, `/fork`'s
   * new tab, an open conflict): the history is loaded from its transcript and
   * the first launch resumes it with `forkSession`, so the copy gets its own
   * id and the original is never written to.
   */
  forkConversation(sessionId: string, summary: string | undefined): Session {
    const fork = new Session(() => this.getConnection(), this.context, { isExplicit: true });
    fork.sessionId(sessionId);
    fork.summary(summary);
    fork.lastModifiedTime(Date.now());
    fork.forkOnNextLaunch();
    this.attachPermissionListener(fork);
    this.sessions([fork, ...this.sessions()]);
    this.openConflict(undefined);
    this.activeSession(fork);
    return fork;
  }

  dispose(): void {
    // Clean up all effects
    for (const cleanup of this.effectCleanups) {
      cleanup();
    }
    this.effectCleanups = [];

    // Clean up all sessions
    for (const session of this.sessions()) {
      session.dispose();
    }
  }

  private attachPermissionListener(session: Session): void {
    session.onPermissionRequested((request) => {
      this.permissionRequested.emit({
        session,
        permissionRequest: request
      });
      if (this.activeSession() !== session) {
        this.activeSession(session);
      }
    });
  }

  /** Which of two copies of one conversation to keep: the shown one, then a running one, then one with a transcript */
  private liveness(session: Session): number {
    return (
      (this.activeSession() === session ? 4 : 0) +
      (session.hasChannel() ? 2 : 0) +
      (session.messages().length > 0 ? 1 : 0)
    );
  }

  private mergeSessionMetadata(target: Session, source: Session): void {
    if (source.summary() && source.summary() !== target.summary()) {
      target.summary(source.summary());
    }

    if (source.lastModifiedTime() > target.lastModifiedTime()) {
      target.lastModifiedTime(source.lastModifiedTime());
    }

    if (!target.worktree() && source.worktree()) {
      target.worktree(source.worktree());
    }
  }
}
