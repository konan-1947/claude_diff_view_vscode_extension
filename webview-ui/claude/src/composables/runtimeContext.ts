import type { RuntimeInstance } from './useRuntime';
import { InjectionKey } from 'vue';

export const RuntimeKey: InjectionKey<RuntimeInstance> = Symbol('runtime');

