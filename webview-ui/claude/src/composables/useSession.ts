/**
 * useSession - Vue Composable for Session
 *
 * Core features:
 * 1. Convert the Session class's alien-signals into Vue refs
 * 2. Convert alien computed into Vue computed
 * 3. Provide a Vue-friendly API
 *
 * Usage:
 * ```typescript
 * const session = new Session(...);
 * const sessionAPI = useSession(session);
 * // sessionAPI.messages is a Vue Ref<any[]>
 * // sessionAPI.busy is a Vue Ref<boolean>
 * ```
 */

import { computed } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { Session, SelectionRange, InFlightPrompt, ColdResumeInfo } from '../core/Session';
import type { PermissionRequest } from '../core/PermissionRequest';
import type { BaseTransport } from '../transport/BaseTransport';
import type { McpServerInfo, ModelOption } from '@shared/messages';

/**
 * useSession return type
 */
export interface UseSessionReturn {
  // Base state
  connection: Ref<BaseTransport | undefined>;
  busy: Ref<boolean>;
  /** A bash-mode command (`!command`) is running */
  shellRunning: Ref<boolean>;
  isLoading: Ref<boolean>;
  error: Ref<string | undefined>;
  sessionId: Ref<string | undefined>;
  isExplicit: Ref<boolean>;
  lastModifiedTime: Ref<number>;

  // Core data
  messages: Ref<any[]>;
  /** Prompts sent mid-turn that the CLI has not taken in yet (shown under the input) */
  inFlightPrompts: Ref<InFlightPrompt[]>;
  messageCount: Ref<number>;
  cwd: Ref<string | undefined>;
  permissionMode: Ref<PermissionMode>;
  summary: Ref<string | undefined>;
  modelSelection: Ref<string | undefined>;
  cliModel: Ref<string | undefined>;
  thinkingLevel: Ref<string>;
  effortLevel: Ref<string>;
  appliedEffort: Ref<string | null | undefined>;
  refreshAppliedEffort: () => Promise<string | null | undefined>;
  todos: Ref<any[]>;
  worktree: Ref<{ name: string; path: string } | undefined>;
  selection: Ref<SelectionRange | undefined>;

  // Usage stats
  usageData: Ref<{
    totalTokens: number;
    totalCost: number;
    contextWindow: number;
  }>;

  // Computed properties
  claudeConfig: ComputedRef<any>;
  config: ComputedRef<any>;
  permissionRequests: ComputedRef<PermissionRequest[]>;

  // Derived state
  isOffline: ComputedRef<boolean>;

  // Methods
  getConnection: () => Promise<BaseTransport>;
  preloadConnection: () => Promise<void>;
  loadFromServer: () => Promise<void>;
  send: (
    input: string,
    attachments?: Array<{ fileName: string; mediaType: string; data: string }>,
    includeSelection?: boolean
  ) => Promise<void>;
  /** "Resume this conversation?" due before sending (see Session.checkColdResume) */
  checkColdResume: () => Promise<ColdResumeInfo | undefined>;
  markColdResumeAsked: () => void;
  launchClaude: () => Promise<string>;
  interrupt: () => Promise<void>;
  restartClaude: () => Promise<void>;
  listFiles: (pattern?: string) => Promise<any>;
  setPermissionMode: (mode: PermissionMode, applyToConnection?: boolean) => Promise<boolean>;
  setModel: (model: ModelOption) => Promise<boolean>;
  adoptModel: (model: string) => void;
  setThinkingLevel: (level: string) => Promise<void>;
  setEffortLevel: (level: string, persist?: boolean) => Promise<void>;
  getMcpServers: () => Promise<McpServerInfo[]>;
  mcpServerAction: (action: 'reconnect' | 'enable' | 'disable', serverName: string) => Promise<string | undefined>;
  getOutputStyles: () => Promise<{ current?: string; available: string[] }>;
  openConfigFile: (configType: string) => Promise<void>;
  onPermissionRequested: (callback: (request: PermissionRequest) => void) => () => void;
  dispose: () => void;

  // Raw instance (for advanced use)
  __session: Session;
}

/**
 * useSession - wraps a Session instance as a Vue Composable API
 *
 * @param session Session instance
 * @returns Vue-friendly API
 */
export function useSession(session: Session): UseSessionReturn {
  //  Bridge signals/computed with the official useSignal
  const connection = useSignal(session.connection);
  const busy = useSignal(session.busy);
  const shellRunning = useSignal(session.shellRunning);
  const isLoading = useSignal(session.isLoading);
  const error = useSignal(session.error);
  const sessionId = useSignal(session.sessionId);
  const isExplicit = useSignal(session.isExplicit);
  const lastModifiedTime = useSignal(session.lastModifiedTime);
  const messages = useSignal(session.messages);
  const inFlightPrompts = useSignal(session.inFlightPrompts);
  const messageCount = useSignal(session.messageCount);
  const cwd = useSignal(session.cwd);
  const permissionMode = useSignal(session.permissionMode);
  const summary = useSignal(session.summary);
  const modelSelection = useSignal(session.modelSelection);
  const cliModel = useSignal(session.cliModel);
  const thinkingLevel = useSignal(session.thinkingLevel);
  const effortLevel = useSignal(session.effortLevel);
  const appliedEffort = useSignal(session.appliedEffort);
  const refreshAppliedEffort = session.refreshAppliedEffort.bind(session);
  const todos = useSignal(session.todos);
  const worktree = useSignal(session.worktree);
  const selection = useSignal(session.selection);
  const usageData = useSignal(session.usageData);

  //  Wrap alien computed with useSignal (read-only use, the setter is never called)
  const claudeConfig = useSignal(session.claudeConfig as any);
  const config = useSignal(session.config as any);
  const permissionRequests = useSignal(session.permissionRequests) as unknown as ComputedRef<PermissionRequest[]>;

  //  Derived state (Vue computed kept for now)
  const isOffline = computed(() => session.isOffline());

  //  Bind all methods (so `this` is correct)
  const getConnection = session.getConnection.bind(session);
  const preloadConnection = session.preloadConnection.bind(session);
  const loadFromServer = session.loadFromServer.bind(session);
  const send = session.send.bind(session);
  const checkColdResume = session.checkColdResume.bind(session);
  const markColdResumeAsked = session.markColdResumeAsked.bind(session);
  const launchClaude = session.launchClaude.bind(session);
  const interrupt = session.interrupt.bind(session);
  const restartClaude = session.restartClaude.bind(session);
  const listFiles = session.listFiles.bind(session);
  const setPermissionMode = session.setPermissionMode.bind(session);
  const setModel = session.setModel.bind(session);
  const adoptModel = session.adoptModel.bind(session);
  const setThinkingLevel = session.setThinkingLevel.bind(session);
  const setEffortLevel = session.setEffortLevel.bind(session);
  const getMcpServers = session.getMcpServers.bind(session);
  const mcpServerAction = session.mcpServerAction.bind(session);
  const getOutputStyles = session.getOutputStyles.bind(session);
  const openConfigFile = session.openConfigFile.bind(session);
  const onPermissionRequested = session.onPermissionRequested.bind(session);
  const dispose = session.dispose.bind(session);

  return {
    // State
    connection,
    busy,
    shellRunning,
    isLoading,
    error,
    sessionId,
    isExplicit,
    lastModifiedTime,
    messages,
    inFlightPrompts,
    messageCount,
    cwd,
    permissionMode,
    summary,
    modelSelection,
    cliModel,
    thinkingLevel,
    effortLevel,
    appliedEffort,
    refreshAppliedEffort,
    todos,
    worktree,
    selection,
    usageData,

    // Computed properties
    claudeConfig,
    config,
    permissionRequests,
    isOffline,

    // Methods
    getConnection,
    preloadConnection,
    loadFromServer,
    send,
    checkColdResume,
    markColdResumeAsked,
    launchClaude,
    interrupt,
    restartClaude,
    listFiles,
    setPermissionMode,
    setModel,
    adoptModel,
    setThinkingLevel,
    setEffortLevel,
    getMcpServers,
    mcpServerAction,
    getOutputStyles,
    openConfigFile,
    onPermissionRequested,
    dispose,

    // Raw instance
    __session: session,
  };
}
