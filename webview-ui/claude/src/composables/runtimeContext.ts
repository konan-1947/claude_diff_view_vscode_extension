import type { RuntimeInstance } from './useRuntime';
import { InjectionKey } from 'vue';

export const RuntimeKey: InjectionKey<RuntimeInstance> = Symbol('runtime');


/** ChatPage → UserMessage: open Rewind on this message ("Restore checkpoint") */
export const RestoreCheckpointKey: InjectionKey<(message: import('../models/Message').Message) => void> =
  Symbol('restoreCheckpoint');
