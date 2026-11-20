import * as vscode from 'vscode';
import { InstantiationServiceBuilder } from './di/instantiationServiceBuilder';
import {
  registerServices,
  IClaudeAgentService,
  IClaudeSdkService,
  IWebViewService,
} from './services/serviceRegistry';
import { VSCodeTransport } from './services/claude/transport/VSCodeTransport';
import type { IClaudeAgentService as AgentServiceApi } from './services/claude/ClaudeAgentService';
import type { IClaudeSdkService as SdkServiceApi } from './services/claude/ClaudeSdkService';
import type { IWebViewService as WebViewServiceApi } from './services/webViewService';

/**
 * Claude UI backend: the uic (Claudix) services, wired the same way upstream's
 * extension.ts does, minus its sidebar view. The webview side lives in
 * webview-ui/claude and runs as an iframe per Claude UI tab inside the
 * terminal panel; `webViews` routes messages between those tabs and the agent.
 *
 * The agent and its configuration service are created on the first message
 * from a Claude UI tab, not at activation: the configuration service creates
 * its files under ~/.claude, which a user who never opens Claude UI should not get.
 */
export interface ClaudeUiBackend extends vscode.Disposable {
  readonly webViews: WebViewServiceApi;
}

export function createClaudeUiBackend(
  context: vscode.ExtensionContext,
  beforeFileWrite: (filePath: string) => Promise<void> | void,
): ClaudeUiBackend {
  const builder = new InstantiationServiceBuilder();
  registerServices(builder, context);
  const instantiation = builder.seal();
  const webViews = instantiation.invokeFunction((accessor) => accessor.get(IWebViewService));

  let agent: AgentServiceApi | undefined;
  let sdk: SdkServiceApi | undefined;

  const ensureAgent = (): AgentServiceApi => {
    if (agent) {
      return agent;
    }
    const started = instantiation.invokeFunction((accessor) => ({
      agent: accessor.get(IClaudeAgentService),
      sdk: accessor.get(IClaudeSdkService),
    }));
    agent = started.agent;
    sdk = started.sdk;
    sdk.setBeforeFileWrite(beforeFileWrite);
    agent.setTransport(instantiation.createInstance(VSCodeTransport));
    agent.start();
    return agent;
  };

  webViews.setMessageHandler((message) => {
    void ensureAgent().fromClient(message);
  });
  webViews.setChannelCloser((channelId) => agent?.closeChannel(channelId, false));

  return {
    webViews,
    dispose: () => {
      sdk?.setBeforeFileWrite(undefined);
      void agent?.shutdown();
    },
  };
}
