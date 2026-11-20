/**
 * Telemetry Service
 */

import { createDecorator } from '../di/instantiation';

export const ITelemetryService = createDecorator<ITelemetryService>('telemetryService');

export interface ITelemetryService {
	readonly _serviceBrand: undefined;
	logEvent(eventName: string, data?: Record<string, any>): void;
	logError(error: Error, data?: Record<string, any>): void;
}

export class TelemetryService implements ITelemetryService {
	readonly _serviceBrand: undefined;

	logEvent(eventName: string, data?: Record<string, any>): void {
		console.log(`[Telemetry] Event: ${eventName}`, data);
	}

	logError(error: Error, data?: Record<string, any>): void {
		console.error(`[Telemetry] Error: ${error.message}`, data, error.stack);
	}
}

export class NullTelemetryService implements ITelemetryService {
	readonly _serviceBrand: undefined;
	logEvent(): void { }
	logError(): void { }
}
