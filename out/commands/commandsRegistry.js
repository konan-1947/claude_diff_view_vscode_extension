"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAllCommands = registerAllCommands;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const runnerFactory_1 = require("../runner/runnerFactory");
function registerAllCommands(deps) {
    const { diffManager, panel, context } = deps;
    function getActiveDiffFilePath() {
        return diffManager.getActiveFilePath() ?? diffManager.getPendingFiles()[0];
    }
    async function ensureRunner() {
        if (deps.getRunner()) {
            return deps.getRunner();
        }
        try {
            const result = await (0, runnerFactory_1.createRunner)(diffManager);
            deps.setRunner(result.runner);
            return result.runner;
        }
        catch (err) {
            vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
            return undefined;
        }
    }
    context.subscriptions.push(vscode.commands.registerCommand('ai-cli-diff-view.startSession', async () => {
        const workingDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
        const runner = await ensureRunner();
        if (!runner) {
            return;
        }
        const toolLabel = runner.toolName.charAt(0).toUpperCase() + runner.toolName.slice(1);
        const prompt = await vscode.window.showInputBox({
            title: `AI CLI Diff: Start ${toolLabel} Session`,
            prompt: `Enter a prompt for ${toolLabel}`,
            placeHolder: 'e.g. "Add JSDoc comments to all functions"',
            ignoreFocusOut: true,
        });
        if (!prompt) {
            return;
        }
        panel.setRunning(prompt);
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `AI CLI Diff (${toolLabel})`, cancellable: false }, async (progress) => {
            progress.report({ message: 'Starting session...' });
            const onProgress = (step) => {
                progress.report({ message: step });
            };
            try {
                await runner.run(prompt, workingDir, () => { }, onProgress);
                panel.setIdle();
                vscode.window.showInformationMessage(`${toolLabel} session complete.`);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                panel.setError(message);
                vscode.window.showErrorMessage(`${toolLabel} session failed: ${message}`);
            }
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ai-cli-diff-view.openPendingFile', async (filePath) => {
        if (!filePath || typeof filePath !== 'string') {
            return;
        }
        try {
            if (deps.openPendingFileInAgent?.(filePath)) {
                return;
            }
            await diffManager.openDiff(filePath);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`AI CLI Diff: could not open file - ${message}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ai-cli-diff-view.acceptAllHunks', async () => {
        const filePath = getActiveDiffFilePath();
        if (!filePath) {
            vscode.window.showWarningMessage('No active inline diff.');
            return;
        }
        await diffManager.accept(filePath);
        vscode.window.showInformationMessage(`Accepted all changes: ${path.basename(filePath)}`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ai-cli-diff-view.acceptAllChanges', async () => {
        const total = await diffManager.acceptAllPending();
        if (total === 0) {
            vscode.window.showWarningMessage('No pending changes to accept.');
            return;
        }
        vscode.window.showInformationMessage(`Accepted all changes in ${total} file(s).`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ai-cli-diff-view.revertAllHunks', async () => {
        const filePath = getActiveDiffFilePath();
        if (!filePath) {
            vscode.window.showWarningMessage('No active inline diff.');
            return;
        }
        await diffManager.revert(filePath);
        vscode.window.showInformationMessage(`Reverted all changes: ${path.basename(filePath)}`);
    }));
}
//# sourceMappingURL=commandsRegistry.js.map