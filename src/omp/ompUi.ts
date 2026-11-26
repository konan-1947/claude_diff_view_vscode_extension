import * as vscode from 'vscode';
import { InstantiationServiceBuilder } from '../claude/di/instantiationServiceBuilder';
import { SyncDescriptor } from '../claude/di/descriptors';
import { registerServices, IWebViewService } from '../claude/services/serviceRegistry';
import type { ClaudeUiBackend } from '../claude/claudeUi';
import { IOmpAgentService, OmpAgentService } from './OmpAgentService';

/**
 * OMP UI backend: the same chat app and tab plumbing as Claude UI
 * (src/claude/claudeUi.ts), with OmpAgentService (`omp --mode rpc`) in place
 * of ClaudeAgentService. It has its own WebViewService, so its channels and
 * broadcasts never reach Claude UI tabs.
 */
export function createOmpUiBackend(
  context: vscode.ExtensionContext,
  beforeFileWrite: (filePath: string) => Promise<void> | void,
  afterFileWrite: (filePath: string) => void,
): ClaudeUiBackend {
  const builder = new InstantiationServiceBuilder();
  // Shared editor/UI services; the Claude services are registered but never created
  registerServices(builder, context);
  builder.define(IOmpAgentService, new SyncDescriptor(OmpAgentService));
  const instantiation = builder.seal();
  const webViews = instantiation.invokeFunction((accessor) => accessor.get(IWebViewService));

  let agent: IOmpAgentService | undefined;
  const ensureAgent = (): IOmpAgentService => {
    if (!agent) {
      agent = instantiation.invokeFunction((accessor) => accessor.get(IOmpAgentService));
      agent.setFileWriteHooks(beforeFileWrite, afterFileWrite);
    }
    return agent;
  };

  webViews.setMessageHandler((message) => ensureAgent().fromClient(message));
  webViews.setChannelCloser((channelId) => agent?.closeChannel(channelId, false));

  return {
    webViews,
    dispose: () => {
      agent?.setFileWriteHooks(undefined, undefined);
      agent?.shutdown();
    },
  };
}
