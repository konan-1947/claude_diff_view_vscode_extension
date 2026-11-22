import { signal } from 'alien-signals';
import type { ConnectionManager } from './ConnectionManager';
import type { SelectionRange } from './Session';
import type { ShowNotificationRequest, OpenURLRequest } from '@shared/messages';

export interface CommandAction {
  id: string;
  label: string;
  description?: string;
  hasChevron?: boolean;
}

interface RegisteredCommand {
  action: CommandAction;
  section: string;
  handler: () => void;
}

const COMMAND_SECTION_ORDER = [
  'Slash Commands'
] as const;
type CommandSection = (typeof COMMAND_SECTION_ORDER)[number] | string;

export class CommandRegistry {
  private readonly actions = new Map<string, RegisteredCommand>();
  private readonly sections = new Map<CommandSection, CommandAction[]>();

  registerAction(action: CommandAction, section: CommandSection, handler: () => void): () => void {
    const registeredSection = this.normaliseSection(section);
    this.actions.set(action.id, { action, section: registeredSection, handler });

    const current = this.sections.get(registeredSection) ?? [];
    const index = current.findIndex((item) => item.id === action.id);
    if (index >= 0) {
      current[index] = action;
    } else {
      current.push(action);
    }
    if (registeredSection === 'Slash Commands') {
      current.sort((a, b) => a.label.localeCompare(b.label));
    }
    this.sections.set(registeredSection, current);

    return () => {
      this.actions.delete(action.id);
      const list = this.sections.get(registeredSection);
      if (list) {
        const position = list.findIndex((item) => item.id === action.id);
        if (position >= 0) {
          list.splice(position, 1);
        }
      }
    };
  }

  executeCommand(id: string): void {
    const entry = this.actions.get(id);
    entry?.handler();
  }

  getCommandsBySection(): Record<string, CommandAction[]> {
    const result: Record<string, CommandAction[]> = {};
    for (const section of COMMAND_SECTION_ORDER) {
      const actions = this.sections.get(section);
      if (actions && actions.length > 0) {
        result[section] = [...actions];
      }
    }
    for (const [section, actions] of this.sections.entries()) {
      if (
        !(COMMAND_SECTION_ORDER as readonly string[]).includes(section as string) &&
        actions.length > 0
      ) {
        result[section] = [...actions];
      }
    }
    return result;
  }

  getActionHandler(id: string): (() => void) | undefined {
    return this.actions.get(id)?.handler;
  }

  private normaliseSection(section: CommandSection): CommandSection {
    if (COMMAND_SECTION_ORDER.includes(section as any)) {
      return section;
    }
    return section;
  }
}

export class AppContext {
  readonly commandRegistry = new CommandRegistry();
  readonly currentSelection = signal<SelectionRange | undefined>(undefined);
  readonly assetUris = signal<Record<string, { light: string; dark: string }> | undefined>(
    undefined
  );

  constructor(private readonly connectionManager: ConnectionManager) {}

  // File opening capability
  readonly fileOpener = {
    open: async (filePath: string, location?: any) => {
      const connection = await this.connectionManager.get();
      await connection.openFile(filePath, location);
    },
    openContent: async (content: string, fileName: string, editable: boolean) => {
      const connection = await this.connectionManager.get();
      return connection.openContent(content, fileName, editable);
    }
  };

  showNotification(
    message: string,
    severity: ShowNotificationRequest['severity'],
    buttons?: string[],
    onlyIfNotVisible?: boolean
  ): Promise<string | undefined> {
    return this.connectionManager
      .get()
      .then((connection) =>
        connection.showNotification(message, severity, buttons, onlyIfNotVisible)
      );
  }

  safeFocus(element: HTMLElement): void {
    if (document.activeElement === document.body && element) {
      element.focus();
    }
  }

  /** Tabs live in the host's terminal tab strip: ask it to open one. */
  startNewConversationTab(initialPrompt?: string): void {
    void this.connectionManager.get().then((c) => c.startNewConversationTab(initialPrompt));
  }

  /** Set the title of the host tab showing this conversation. */
  renameTab(title: string): void {
    void this.connectionManager.get().then((c) => c.renameTab(title));
  }

  openURL(url: OpenURLRequest['url']): void {
    void this.connectionManager.get().then((connection) => connection.openURL(url));
  }

  get platform(): string {
    const connection = this.connectionManager.connection();
    return connection?.config()?.platform ?? 'macos';
  }
}
