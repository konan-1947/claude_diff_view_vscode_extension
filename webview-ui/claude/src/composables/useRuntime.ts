import { onMounted, onUnmounted, watch } from 'vue';
import { signal, effect } from 'alien-signals';
import { ConnectionManager } from '../core/ConnectionManager';
import { AppContext } from '../core/AppContext';
import { SessionStore } from '../core/SessionStore';
import type { SelectionRange } from '../core/Session';
import { EventEmitter } from '../utils/events';
import { transport, atMentionEvents, selectionEvents } from '../core/runtimeTransport';
import { uiSlashCommands, uiCommandId } from '../providers/slashCommandProvider';

export interface RuntimeInstance {
  connectionManager: ConnectionManager;
  appContext: AppContext;
  sessionStore: SessionStore;
  atMentionEvents: EventEmitter<string>;
  selectionEvents: EventEmitter<any>;
}

export function useRuntime(): RuntimeInstance {
  // Reuse the global Transport instance so one Webview host has only one channel
  const connectionManager = new ConnectionManager(() => transport);
  const appContext = new AppContext(connectionManager);

  // Create an alien-signal for SessionContext
  // AppContext.currentSelection is a Vue Ref, but SessionContext needs an alien-signal
  const currentSelectionSignal = signal<SelectionRange | undefined>(undefined);

  // Two-way sync Vue Ref ↔ Alien Signal
  // Vue Ref → Alien Signal
  watch(
    () => appContext.currentSelection(),
    (newValue) => {
      currentSelectionSignal(newValue);
    },
    { immediate: true }
  );

  const sessionStore = new SessionStore(connectionManager, {
    commandRegistry: appContext.commandRegistry,
    currentSelection: currentSelectionSignal,
    fileOpener: appContext.fileOpener,
    showNotification: appContext.showNotification?.bind(appContext),
    startNewConversationTab: appContext.startNewConversationTab?.bind(appContext),
    renameTab: appContext.renameTab?.bind(appContext),
    openURL: appContext.openURL.bind(appContext)
  });

  selectionEvents.add((selection) => {
    appContext.currentSelection(selection);
  });

  // The effect inside SessionStore watches for the connection and fetches the session list automatically

  // Commands the CLI lists but that do nothing useful through the SDK, so they
  // stay out of the `/` suggestions (typed by hand they still go to the CLI):
  // /color only tints the CLI's prompt bar, /agents lost its wizard, /focus
  // "isn't available here yet", /fast "is not available in the Agent SDK".
  const HIDDEN_SLASH_COMMANDS = new Set(['color', 'agents', 'focus', 'fast']);

  // Commands this UI answers with its own panel (ChatInputBox opens it on
  // submit / pick). Should a CLI start listing one of them, the UI one wins.
  const UI_COMMAND_NAMES = new Set(uiSlashCommands.map((cmd) => cmd.name));
  const uiCommandDisposers = uiSlashCommands.map((cmd) =>
    appContext.commandRegistry.registerAction(
      {
        id: uiCommandId(cmd.name),
        label: `/${cmd.name}`,
        description: cmd.description,
        argumentHint: cmd.argumentHint,
        aliases: cmd.aliases
      },
      'Slash Commands',
      () => {}
    )
  );

  // Watch claudeConfig changes and register Slash Commands
  let slashCommandDisposers: Array<() => void> = [];

  const cleanupSlashCommands = effect(() => {
    const connection = connectionManager.connection();
    const claudeConfig = connection?.claudeConfig();

    // Clean up old Slash Commands
    slashCommandDisposers.forEach(dispose => dispose());
    slashCommandDisposers = [];

    // Register new Slash Commands
    if (claudeConfig?.slashCommands && Array.isArray(claudeConfig.slashCommands)) {
      slashCommandDisposers = claudeConfig.slashCommands
        .filter((cmd: any) => typeof cmd?.name === 'string' && cmd.name && !HIDDEN_SLASH_COMMANDS.has(cmd.name) && !UI_COMMAND_NAMES.has(cmd.name))
        .map((cmd: any) => {
          return appContext.commandRegistry.registerAction(
            {
              id: `slash-command-${cmd.name}`,
              label: `/${cmd.name}`,
              description: typeof cmd?.description === 'string' ? cmd.description : undefined,
              argumentHint: typeof cmd?.argumentHint === 'string' && cmd.argumentHint.trim() ? cmd.argumentHint.trim() : undefined,
              // A plugin's `plugin:name` alias is its source, not another name
              aliases: Array.isArray(cmd?.aliases)
                ? cmd.aliases.filter((a: unknown): a is string => typeof a === 'string' && !!a && !a.includes(':'))
                : undefined,
              source: typeof cmd?.source === 'string' && cmd.source ? cmd.source : undefined
            },
            'Slash Commands',
            () => {
              console.log('[Runtime] Execute slash command:', cmd.name);
              const activeSession = sessionStore.activeSession();
              if (activeSession) {
                void activeSession.send(`/${cmd.name}`, [], false);
              } else {
                console.warn('[Runtime] No active session to execute slash command');
              }
            }
          );
        });

      console.log('[Runtime] Registered', slashCommandDisposers.length, 'slash commands');
    }
  });

  onMounted(() => {
    let disposed = false;

    (async () => {
      const connection = await connectionManager.get();
      try { await connection.opened; } catch (e) { console.error('[runtime] open failed', e); return; }

      if (disposed) return;

      try {
        const selection = await connection.getCurrentSelection();
        if (!disposed) appContext.currentSelection(selection?.selection ?? undefined);
      } catch (e) { console.warn('[runtime] selection fetch failed', e); }

      try {
        const assets = await connection.getAssetUris();
        if (!disposed) appContext.assetUris(assets.assetUris);
      } catch (e) { console.warn('[runtime] assets fetch failed', e); }

      // A failed history load must not stop the tab from getting a session.
      try {
        await sessionStore.listSessions();
      } catch (e) {
        console.warn('[runtime] session list failed', e);
      }
      const resumeId = window.UIC_BOOTSTRAP?.resume;
      if (!disposed && resumeId && !sessionStore.activeSession()) {
        const previous = sessionStore.sessions().find((s) => s.sessionId() === resumeId);
        if (previous) sessionStore.setActiveSession(previous);
      }
      if (!disposed && !sessionStore.activeSession()) {
        await sessionStore.createSession({ isExplicit: false });
      }
    })();

    onUnmounted(() => {
      disposed = true;

      // Clean up command registrations
      slashCommandDisposers.forEach(dispose => dispose());
      uiCommandDisposers.forEach(dispose => dispose());
      cleanupSlashCommands();

      connectionManager.close();
    });
  });

  return { connectionManager, appContext, sessionStore, atMentionEvents, selectionEvents };
}

