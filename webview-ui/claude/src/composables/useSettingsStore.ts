import { useSignal } from '@gn8/alien-signals-vue';
import type { Ref } from 'vue';
import type { SettingsStore, SettingsState, SdkCapabilities } from '../core/SettingsStore';

let storeInstance: SettingsStore | null = null;

export function initSettingsStore(store: SettingsStore) {
  storeInstance = store;
}

export type SettingsScope = 'global' | 'shared' | 'local';

export interface UseSettingsStoreReturn {
  settings: Readonly<Ref<SettingsState>>;
  activeProfile: Readonly<Ref<string | null>>;
  profiles: Readonly<Ref<string[]>>;
  hasWorkspace: Readonly<Ref<boolean>>;
  sdkCapabilities: Readonly<Ref<SdkCapabilities>>;
  sdkCapabilitiesLoading: Readonly<Ref<boolean>>;
  updateSetting: <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
    target?: SettingsScope
  ) => void;
  resetSetting: (key: string, target: SettingsScope) => Promise<void>;
  inspect: (key: string) => any;
  switchProfile: (profile: string | null) => Promise<void>;
  createProfile: (name: string) => Promise<void>;
  deleteProfile: (name: string) => Promise<void>;
  refreshSdkCapabilities: () => Promise<void>;
}

export function useSettingsStore(): UseSettingsStoreReturn {
  if (!storeInstance) {
    throw new Error('SettingsStore not initialized');
  }

  const settings = useSignal(storeInstance.settings);
  const activeProfile = useSignal(storeInstance.activeProfile);
  const profiles = useSignal(storeInstance.profiles);
  const hasWorkspace = useSignal(storeInstance.hasWorkspace);
  const sdkCapabilities = useSignal(storeInstance.sdkCapabilities);
  const sdkCapabilitiesLoading = useSignal(storeInstance.sdkCapabilitiesLoading);

  const updateSetting = storeInstance.updateSetting.bind(storeInstance);
  const resetSetting = storeInstance.resetSetting.bind(storeInstance);
  const inspect = storeInstance.inspect.bind(storeInstance);
  const switchProfile = storeInstance.switchProfile.bind(storeInstance);
  const createProfile = storeInstance.createProfile.bind(storeInstance);
  const deleteProfile = storeInstance.deleteProfile.bind(storeInstance);
  const refreshSdkCapabilities = storeInstance.refreshSdkCapabilities.bind(storeInstance);

  return {
    settings,
    activeProfile,
    profiles,
    hasWorkspace,
    sdkCapabilities,
    sdkCapabilitiesLoading,
    updateSetting,
    resetSetting,
    inspect,
    switchProfile,
    createProfile,
    deleteProfile,
    refreshSdkCapabilities
  };
}
