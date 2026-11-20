import { signal, computed, effect } from 'alien-signals';
import type { BaseTransport } from '../transport/BaseTransport';

export interface SettingsState {
  systemNotifications: boolean;
  completionSound: boolean;
  [key: string]: any; // Allow dynamic settings
}

export interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
}

export interface SlashCommand {
  name: string;
  description: string;
  argumentHint: string;
}

export interface McpServerStatus {
  name: string;
  status: 'connected' | 'failed' | 'needs-auth' | 'pending';
  serverInfo?: { name: string; version: string };
}

export interface AccountInfo {
  email?: string;
  organization?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
}

export interface SdkCapabilities {
  supportedModels: ModelInfo[];
  supportedCommands: SlashCommand[];
  mcpServerStatus: McpServerStatus[];
  accountInfo: AccountInfo | null;
}

export class SettingsStore {
  private readonly _settings = signal<SettingsState>({
    // Boolean defaults for Switch, avoiding the Vue warning about an undefined modelValue
    systemNotifications: false,
    completionSound: true
  } as SettingsState);

  private readonly _metadata = signal<Record<string, any>>({});
  private readonly _activeProfile = signal<string | null>(null);
  private readonly _profiles = signal<string[]>([]);

  // Whether a workspace folder is open (determines if shared/local scopes are available)
  private readonly _hasWorkspace = signal<boolean>(false);

  // SDK capability data
  private readonly _sdkCapabilities = signal<SdkCapabilities>({
    supportedModels: [],
    supportedCommands: [],
    mcpServerStatus: [],
    accountInfo: null
  });
  private readonly _sdkCapabilitiesLoading = signal<boolean>(true);

  constructor(private readonly transport: BaseTransport) {
    this.initialize();
  }

  private async initialize() {
    // Fetch settings and SDK capabilities in parallel
    await Promise.all([
      this.fetchSettings(),
      this.fetchSdkCapabilities()
    ]);
  }

  private async fetchSettings() {
    try {
      const response = await this.transport.getSettings();
      if (response) {
        if (response.settings) {
          this._settings({ ...this._settings(), ...response.settings });
        }
        if (response.metadata) {
          this._metadata(response.metadata);
        }
        this._activeProfile(response.activeProfile);
        this._profiles(response.profiles || []);
        this._hasWorkspace(response.hasWorkspace ?? false);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  }

  private async fetchSdkCapabilities() {
    this._sdkCapabilitiesLoading(true);
    try {
      const response = await this.transport.sdkProbe(
        ['supportedModels', 'supportedCommands', 'mcpServerStatus', 'accountInfo'],
        30000 // 30s timeout
      );
      const rawModels = response.data?.supportedModels || [];
      this._sdkCapabilities({
        supportedModels: rawModels.filter((m: ModelInfo) => m.description !== 'Custom model'),
        supportedCommands: response.data?.supportedCommands || [],
        mcpServerStatus: response.data?.mcpServerStatus || [],
        accountInfo: response.data?.accountInfo || null
      });
    } catch (error) {
      console.error('Failed to fetch SDK capabilities:', error);
      // Keep the default empty array
    } finally {
      this._sdkCapabilitiesLoading(false);
    }
  }

  get settings() {
    return this._settings;
  }

  get activeProfile() {
    return this._activeProfile;
  }

  get profiles() {
    return this._profiles;
  }

  get sdkCapabilities() {
    return this._sdkCapabilities;
  }

  get hasWorkspace() {
    return this._hasWorkspace;
  }

  get sdkCapabilitiesLoading() {
    return this._sdkCapabilitiesLoading;
  }

  inspect(key: string) {
    const meta = this._metadata()[key];
    const value = this._settings()[key];
    return {
      key,
      value,
      ...meta
    };
  }

  updateSetting<K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
    target?: 'local' | 'shared' | 'global'
  ) {
    // Resolve the metadata scope key:
    // When a profile is active and target is 'global', the backend writes to the profile file,
    // so the metadata key is 'profile' (not 'global', which represents settings.json).
    const profile = this._activeProfile();
    const scope = (profile && (!target || target === 'global')) ? 'profile' : (target || 'global');

    const currentMeta = this._metadata();
    const keyMeta = currentMeta[key as string] || { values: {} };
    const schemaDefault = keyMeta.values?.default;

    // Mirror backend delta-only logic:
    // If value equals the CC schema default, the backend will DELETE the key.
    const matchesDefault = schemaDefault !== undefined &&
      JSON.stringify(value) === JSON.stringify(schemaDefault);

    const newValues = { ...keyMeta.values };
    if (matchesDefault) {
      delete newValues[scope];
    } else {
      newValues[scope] = value;
    }

    // Recalculate effective value and scope from remaining values (highest priority first)
    // Per CC SDK: managed > cli > profile(flagSettings) > local > shared > global(userSettings)
    const SCOPE_PRIORITY = ['managed', 'cli', 'profile', 'local', 'shared', 'global'] as const;
    let effectiveScope = 'default';
    let effectiveValue: any = schemaDefault;
    for (const s of SCOPE_PRIORITY) {
      if (newValues[s] !== undefined) {
        effectiveScope = s;
        effectiveValue = newValues[s];
        break;
      }
    }

    // Optimistic update
    const current = this._settings();
    this._settings({ ...current, [key]: effectiveValue ?? value });
    this._metadata({
      ...currentMeta,
      [key as string]: {
        ...keyMeta,
        effectiveScope,
        values: newValues
      }
    });

    // Send update to extension
    this.transport
      .updateSetting(key as string, value, target)
      .catch((err) => console.error('Failed to update setting:', err));

    console.log(`Setting updated: ${String(key)} = ${value} (target: ${scope})`);
  }

  async resetSetting(key: string, target: 'local' | 'shared' | 'global') {
    // Optimistic update: remove key from local state immediately
    const current = this._settings();
    const { [key]: _, ...rest } = current as Record<string, any>;
    this._settings(rest as SettingsState);

    try {
      await this.transport.resetSetting(key, target);
      // Re-fetch all settings to get updated merged state
      await this.fetchSettings();
    } catch (err) {
      // Rollback on failure
      this._settings(current);
      console.error('Failed to reset setting:', err);
      throw err;
    }
  }

  async switchProfile(profile: string | null) {
    try {
      await this.transport.switchProfile(profile);
      await this.initialize();
    } catch (err) {
      console.error('Failed to switch profile:', err);
    }
  }

  async createProfile(name: string) {
    try {
      await this.transport.createProfile(name);
      await this.initialize();
    } catch (err) {
      console.error('Failed to create profile:', err);
      throw err;
    }
  }

  async deleteProfile(name: string) {
    try {
      await this.transport.deleteProfile(name);
      await this.initialize();
    } catch (err) {
      console.error('Failed to delete profile:', err);
      throw err;
    }
  }

  /**
   * Refresh SDK capability data
   */
  async refreshSdkCapabilities() {
    await this.fetchSdkCapabilities();
  }
}
