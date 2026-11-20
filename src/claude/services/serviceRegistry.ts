/**
 * Service Registry
 * Centralized registration of all services to the DI container
 */

import * as vscode from 'vscode';
import { SyncDescriptor } from '../di/descriptors';
import { IInstantiationServiceBuilder } from '../di/instantiationServiceBuilder';

// Import all services
import { ILogService, LogService } from './logService';
import { IConfigurationService, ConfigurationService } from './configurationService';
import { IFileSystemService, FileSystemService } from './fileSystemService';
import { IWorkspaceService, WorkspaceService } from './workspaceService';
import { ITabsAndEditorsService, TabsAndEditorsService } from './tabsAndEditorsService';
import { ITerminalService, TerminalService } from './terminalService';
import { ITelemetryService, TelemetryService, NullTelemetryService } from './telemetryService';
import { INotificationService, NotificationService } from './notificationService';
import { IDialogService, DialogService } from './dialogService';
import { IWebViewService, WebViewService } from './webViewService';

// Claude services
import { IClaudeSdkService, ClaudeSdkService } from './claude/ClaudeSdkService';
import { IClaudeSessionService, ClaudeSessionService } from './claude/ClaudeSessionService';
import { IClaudeAgentService, ClaudeAgentService } from './claude/ClaudeAgentService';

/**
 * Register all services to the builder
 *
 * @param builder - Instantiation service builder
 * @param context - VSCode extension context
 */
export function registerServices(
	builder: IInstantiationServiceBuilder,
	context: vscode.ExtensionContext
): void {
	const isTestMode = context.extensionMode === vscode.ExtensionMode.Test;

	// Core services
	builder.define(ILogService, new SyncDescriptor(LogService));
	builder.define(IConfigurationService, new SyncDescriptor(ConfigurationService));
	builder.define(IFileSystemService, new SyncDescriptor(FileSystemService));

	// Workspace services
	builder.define(IWorkspaceService, new SyncDescriptor(WorkspaceService));
	builder.define(ITabsAndEditorsService, new SyncDescriptor(TabsAndEditorsService));
	builder.define(ITerminalService, new SyncDescriptor(TerminalService));

	// Extension services
	// Use Null implementation in test mode
	builder.define(ITelemetryService, isTestMode
		? new SyncDescriptor(NullTelemetryService)
		: new SyncDescriptor(TelemetryService)
	);
	builder.define(INotificationService, new SyncDescriptor(NotificationService));
	builder.define(IDialogService, new SyncDescriptor(DialogService));

	// WebView service
	builder.define(IWebViewService, new SyncDescriptor(WebViewService));

	// Claude services
	builder.define(IClaudeSdkService, new SyncDescriptor(ClaudeSdkService, [context]));
	builder.define(IClaudeSessionService, new SyncDescriptor(ClaudeSessionService));
	builder.define(IClaudeAgentService, new SyncDescriptor(ClaudeAgentService));
}

// Export all service interfaces for convenience
export {
	ILogService,
	IConfigurationService,
	IFileSystemService,
	IWorkspaceService,
	ITabsAndEditorsService,
	ITerminalService,
	ITelemetryService,
	INotificationService,
	IDialogService,
	IWebViewService,
	IClaudeSdkService,
	IClaudeSessionService,
	IClaudeAgentService
};
