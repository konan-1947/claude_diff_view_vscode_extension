import { inject, ref, type Ref } from 'vue';
import type { SettingsScope } from './useSettingsStore';

/**
 * Injection key for the page-level settings scope.
 * Provided by SettingsPage.vue, consumed by SettingsItem and other scope-aware components.
 */
export const SETTINGS_SCOPE_KEY = Symbol('settingsScope') as symbol;

/**
 * Inject the page-level settings scope.
 * Falls back to 'global' if not provided (e.g. component used outside settings page).
 */
export function useSettingsScope(): Ref<SettingsScope> {
  const scope = inject<Ref<SettingsScope>>(SETTINGS_SCOPE_KEY);
  if (!scope) {
    return ref<SettingsScope>('global') as Ref<SettingsScope>;
  }
  return scope;
}
