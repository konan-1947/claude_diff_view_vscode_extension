/**
 * useSessionStore - Vue Composable for SessionStore
 *
 * Core features:
 * 1. Convert the SessionStore class's alien-signals into Vue refs
 * 2. Convert alien computed into Vue computed
 * 3. Provide a Vue-friendly API
 *
 * Usage:
 * ```typescript
 * const store = new SessionStore(...);
 * const storeAPI = useSessionStore(store);
 * // storeAPI.sessions is a Vue Ref<Session[]>
 * // storeAPI.activeSession is a Vue Ref<Session | undefined>
 * ```
 */

import type { ComputedRef, Ref } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import type { SessionStore, PermissionEvent } from '../core/SessionStore';
import type { Session, SessionOptions } from '../core/Session';
import type { BaseTransport } from '../transport/BaseTransport';

/**
 * useSessionStore return type
 */
export interface UseSessionStoreReturn {
  // State
  sessions: Ref<Session[]>;
  activeSession: Ref<Session | undefined>;

  // Computed properties
  sessionsByLastModified: ComputedRef<Session[]>;
  connectionState: ComputedRef<string>;

  // Methods
  onPermissionRequested: (callback: (event: PermissionEvent) => void) => () => void;
  getConnection: () => Promise<BaseTransport>;
  createSession: (options?: SessionOptions) => Promise<Session>;
  listSessions: () => Promise<void>;
  setActiveSession: (session: Session | undefined) => void;
  dispose: () => void;

  // Raw instance (for advanced use)
  __store: SessionStore;
}

/**
 * useSessionStore - wraps a SessionStore instance as a Vue Composable API
 *
 * @param store SessionStore instance
 * @returns Vue-friendly API
 */
export function useSessionStore(store: SessionStore): UseSessionStoreReturn {
  // 🔥 Bridge with the official useSignal
  const sessions = useSignal(store.sessions);
  const activeSession = useSignal(store.activeSession);

  // 🔥 Wrap alien computed with useSignal
  const sessionsByLastModified = useSignal(store.sessionsByLastModified) as unknown as ComputedRef<Session[]>;
  const connectionState = useSignal(store.connectionState) as unknown as ComputedRef<string>;

  // 🔥 Bind all methods (so `this` is correct)
  const onPermissionRequested = store.onPermissionRequested.bind(store);
  const getConnection = store.getConnection.bind(store);
  const createSession = store.createSession.bind(store);
  const listSessions = store.listSessions.bind(store);
  const setActiveSession = store.setActiveSession.bind(store);
  const dispose = store.dispose.bind(store);

  return {
    // State
    sessions,
    activeSession,

    // Computed properties
    sessionsByLastModified,
    connectionState,

    // Methods
    onPermissionRequested,
    getConnection,
    createSession,
    listSessions,
    setActiveSession,
    dispose,

    // Raw instance
    __store: store,
  };
}
