import { VSCodeTransport } from '../transport/VSCodeTransport';
import { EventEmitter } from '../utils/events';

// Global Transport singleton inside the Webview host
// Each Webview process has its own instance, created only once per host
export const atMentionEvents = new EventEmitter<string>();
export const selectionEvents = new EventEmitter<any>();

export const transport = new VSCodeTransport(atMentionEvents, selectionEvents);

