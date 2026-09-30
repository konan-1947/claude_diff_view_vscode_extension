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
exports.TerminalPanelProvider = void 0;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const ptySession_1 = require("./ptySession");
const fontInstaller_1 = require("./fontInstaller");
const pendingFilesPage_1 = require("./pendingFilesPage");
const terminalHtml_1 = require("./terminalHtml");
const soundNotifications_1 = require("../commands/soundNotifications");
const terminalTypes_1 = require("./terminalTypes");
const SETTINGS_KEY = 'ai-cli-diff-view.terminal.settings';
const INTRODUCE_SEEN_KEY = 'ai-cli-diff-view.introduce.seen';
function imageMimeType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const types = {
        '.apng': 'image/apng',
        '.avif': 'image/avif',
        '.bmp': 'image/bmp',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
        '.jpeg': 'image/jpeg',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
    };
    return types[extension];
}
class TerminalPanelProvider {
    constructor(context, diffManager) {
        this.context = context;
        this.diffManager = diffManager;
        this.sessions = new Map();
        this.nextSessionNum = 0;
        this.sessionState = 'idle';
        this.lastPrompt = '';
        this.errorMessage = '';
        this.lastTerminalFocused = false;
        this.agentModeActive = false;
        this.focusWhenReady = false;
        this.diffPreviewOpen = false;
        this.filePreviewOpen = false;
        this._onDidChangePreviewActiveFile = new vscode.EventEmitter();
        this.onDidChangePreviewActiveFile = this._onDidChangePreviewActiveFile.event;
        this._onDidChangePreviewVisibility = new vscode.EventEmitter();
        this.onDidChangePreviewVisibility = this._onDidChangePreviewVisibility.event;
        this.diffDisposable = this.diffManager.onDidChangeDiffs(() => {
            this.postFilesUpdate();
            if (this.diffPreviewOpen) {
                this.postDiffPreviewFiles();
            }
        });
        this.workspaceDiffDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
            if (this.diffPreviewOpen && this.diffManager.hasPendingDiff(event.document.uri.fsPath)) {
                void this.postDiffPreviewFile(event.document.uri.fsPath);
            }
        });
        this.themeDisposable = vscode.window.onDidChangeActiveColorTheme(() => {
            if (this.diffPreviewOpen) {
                void this.webview?.postMessage({ type: 'diffPreviewTheme', theme: currentMonacoTheme() });
            }
        });
    }
    // Public API used by commandsRegistry (mirrors the old SessionPanelProvider).
    setRunning(prompt) {
        this.sessionState = 'running';
        this.lastPrompt = prompt;
        this.errorMessage = '';
        this.postFilesUpdate();
    }
    setIdle() {
        this.sessionState = 'idle';
        this.postFilesUpdate();
    }
    setError(message) {
        this.sessionState = 'error';
        this.errorMessage = message;
        this.postFilesUpdate();
    }
    refresh() {
        this.postFilesUpdate();
    }
    setAgentMode(active) {
        this.agentModeActive = active;
        void this.webview?.postMessage({ type: 'agentModeState', active });
    }
    toggleDiffPreview() {
        void this.webview?.postMessage({ type: 'toggleDiffPreview' });
    }
    togglePage() {
        void this.webview?.postMessage({ type: 'togglePage' });
    }
    showIntroduce() {
        void this.webview?.postMessage({ type: 'openIntroduce' });
    }
    showSettings() {
        void this.webview?.postMessage({ type: 'openSettings' });
    }
    openPendingFileInAgent(filePath) {
        if (!this.agentModeActive || !this.diffManager.hasPendingDiff(filePath)) {
            return false;
        }
        this.filePreviewOpen = false;
        this.filePreviewPath = undefined;
        this.diffPreviewOpen = true;
        this._onDidChangePreviewVisibility.fire(true);
        this._onDidChangePreviewActiveFile.fire(filePath);
        if (this.webview) {
            void this.webview.postMessage({ type: 'showDiffPreview', path: filePath });
        }
        else {
            this.pendingAgentFilePath = filePath;
        }
        return true;
    }
    openFileInAgent(filePath) {
        if (!this.agentModeActive) {
            return false;
        }
        if (this.diffManager.hasPendingDiff(filePath)) {
            return this.openPendingFileInAgent(filePath);
        }
        this.diffPreviewOpen = false;
        this._onDidChangePreviewVisibility.fire(false);
        this.filePreviewOpen = true;
        this.filePreviewPath = filePath;
        if (this.webview) {
            void this.webview.postMessage({ type: 'showFilePreview', path: filePath });
        }
        else {
            this.pendingAgentFilePreviewPath = filePath;
        }
        return true;
    }
    focusTerminal() {
        if (!this.webview) {
            return;
        }
        try {
            if (this.view) {
                this.view.show(false);
            }
            else {
                this.panel?.reveal(vscode.ViewColumn.Active, true);
            }
            // Revealing the webview is not enough when the editor group was focused
            // by the pending-files view; put the cursor back in xterm as well.
            void this.webview.postMessage({ type: 'focusTerminal' });
        }
        catch {
            // view may not be resolvable yet; ignore.
        }
        this.focusWhenReady = true;
        void this.webview.postMessage({ type: 'focusTerminal' });
    }
    wasTerminalFocused() {
        return this.lastTerminalFocused;
    }
    postFilesUpdate() {
        if (!this.webview) {
            return;
        }
        const html = (0, pendingFilesPage_1.buildPendingFilesInnerHtml)({
            diffManager: this.diffManager,
            iconBase: this.fileIconsBase(),
            sessionState: this.sessionState,
            lastPrompt: this.lastPrompt,
            errorMessage: this.errorMessage,
        });
        void this.webview.postMessage({ type: 'filesUpdate', html });
    }
    fileIconsBase() {
        if (!this.webview) {
            return '';
        }
        return this.webview
            .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'file-icons'))
            .toString() + '/';
    }
    spawnSession(cols, rows) {
        this.nextSessionNum += 1;
        const id = `s${this.nextSessionNum}`;
        const title = resolveShellName();
        const pty = new ptySession_1.PtySession();
        const subs = [
            pty.onData((data) => {
                this.webview?.postMessage({ type: 'data', id, data });
            }),
            pty.onExit((code) => {
                this.webview?.postMessage({ type: 'exit', id, code });
            }),
            pty.onError((message) => {
                this.webview?.postMessage({ type: 'error', id, message });
            }),
        ];
        const safeCols = Math.max(1, cols | 0);
        const safeRows = Math.max(1, rows | 0);
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
        pty.start(cwd, safeCols, safeRows);
        this.sessions.set(id, { pty, subs, title, cols: safeCols, rows: safeRows });
        this.webview?.postMessage({ type: 'sessionCreated', id, title });
        return { id, title };
    }
    closeSessionInternal(id) {
        const rec = this.sessions.get(id);
        if (!rec) {
            return;
        }
        for (const d of rec.subs) {
            try {
                d.dispose();
            }
            catch { /* ignore */ }
        }
        try {
            rec.pty.dispose();
        }
        catch { /* ignore */ }
        this.sessions.delete(id);
        this.webview?.postMessage({ type: 'sessionClosed', id });
    }
    loadSettings() {
        const stored = this.context.globalState.get(SETTINGS_KEY);
        if (!stored || typeof stored !== 'object') {
            return { ...terminalTypes_1.DEFAULT_SETTINGS, customColors: { ...terminalTypes_1.DEFAULT_SETTINGS.customColors } };
        }
        return {
            fontFamily: typeof stored.fontFamily === 'string' && stored.fontFamily.trim()
                ? stored.fontFamily
                : terminalTypes_1.DEFAULT_SETTINGS.fontFamily,
            fontSize: typeof stored.fontSize === 'number' && stored.fontSize >= 6 && stored.fontSize <= 32
                ? stored.fontSize
                : terminalTypes_1.DEFAULT_SETTINGS.fontSize,
            themePreset: this.normalizePreset(stored.themePreset),
            customColors: {
                background: this.normalizeColor(stored.customColors?.background, terminalTypes_1.DEFAULT_SETTINGS.customColors.background),
                foreground: this.normalizeColor(stored.customColors?.foreground, terminalTypes_1.DEFAULT_SETTINGS.customColors.foreground),
                cursor: this.normalizeColor(stored.customColors?.cursor, terminalTypes_1.DEFAULT_SETTINGS.customColors.cursor),
            },
            cursorStyle: this.normalizeCursorStyle(stored.cursorStyle),
            cursorBlink: typeof stored.cursorBlink === 'boolean' ? stored.cursorBlink : terminalTypes_1.DEFAULT_SETTINGS.cursorBlink,
        };
    }
    normalizePreset(v) {
        const presets = ['vscode', 'default-dark', 'solarized-dark', 'dracula', 'custom'];
        return presets.includes(v) ? v : terminalTypes_1.DEFAULT_SETTINGS.themePreset;
    }
    normalizeCursorStyle(v) {
        const styles = ['block', 'underline', 'bar'];
        return styles.includes(v) ? v : terminalTypes_1.DEFAULT_SETTINGS.cursorStyle;
    }
    normalizeColor(v, fallback) {
        return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
    }
    async saveSettings(s) {
        await this.context.globalState.update(SETTINGS_KEY, s);
    }
    loadSettingsPayload() {
        return {
            ...this.loadSettings(),
            supportedFileExtensions: this.loadSupportedFileExtensions(),
            ...this.loadBurstDetectionSettings(),
            ...this.loadSoundNotificationSettings(),
            ...this.loadFileLimitSettings(),
        };
    }
    loadFileLimitSettings() {
        const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
        const value = config.get('maxFileLines', terminalTypes_1.DEFAULT_FILE_LIMIT_SETTINGS.maxFileLines);
        return {
            maxFileLines: Number.isFinite(value)
                ? Math.min(terminalTypes_1.MAX_FILE_LINES_CEILING, Math.max(0, Math.floor(value)))
                : terminalTypes_1.DEFAULT_FILE_LIMIT_SETTINGS.maxFileLines,
        };
    }
    async saveFileLimitSettings(incoming) {
        const next = this.loadFileLimitSettings();
        const value = incoming.maxFileLines;
        const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
        await config.update('maxFileLines', typeof value === 'number' && Number.isFinite(value)
            ? Math.min(terminalTypes_1.MAX_FILE_LINES_CEILING, Math.max(0, Math.floor(value)))
            : next.maxFileLines, vscode.ConfigurationTarget.Global);
    }
    loadSoundNotificationSettings() {
        const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
        return {
            soundNotificationsEnabled: config.get('soundNotificationsEnabled', terminalTypes_1.DEFAULT_SOUND_NOTIFICATION_SETTINGS.soundNotificationsEnabled),
        };
    }
    async saveSoundNotificationSettings(incoming) {
        const next = this.loadSoundNotificationSettings();
        const enabled = typeof incoming.soundNotificationsEnabled === 'boolean'
            ? incoming.soundNotificationsEnabled
            : next.soundNotificationsEnabled;
        const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
        await config.update('soundNotificationsEnabled', enabled, vscode.ConfigurationTarget.Global);
        (0, soundNotifications_1.applySoundNotifications)(enabled);
    }
    loadBurstDetectionSettings() {
        const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
        const windowMs = config.get('burstDetectionWindowMs', terminalTypes_1.DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionWindowMs);
        const threshold = config.get('burstDetectionThreshold', terminalTypes_1.DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionThreshold);
        const holdMs = config.get('burstDetectionHoldMs', terminalTypes_1.DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionHoldMs);
        return {
            burstDetectionEnabled: config.get('burstDetectionEnabled', terminalTypes_1.DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionEnabled),
            burstDetectionWindowMs: Number.isFinite(windowMs)
                ? Math.min(5000, Math.max(50, windowMs))
                : terminalTypes_1.DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionWindowMs,
            burstDetectionThreshold: Number.isFinite(threshold)
                ? Math.min(500, Math.max(2, threshold))
                : terminalTypes_1.DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionThreshold,
            burstDetectionHoldMs: Number.isFinite(holdMs)
                ? Math.min(10000, Math.max(500, holdMs))
                : terminalTypes_1.DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionHoldMs,
        };
    }
    async saveBurstDetectionSettings(incoming) {
        const next = this.loadBurstDetectionSettings();
        const windowMs = incoming.burstDetectionWindowMs;
        const threshold = incoming.burstDetectionThreshold;
        const holdMs = incoming.burstDetectionHoldMs;
        const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
        await Promise.all([
            config.update('burstDetectionEnabled', typeof incoming.burstDetectionEnabled === 'boolean' ? incoming.burstDetectionEnabled : next.burstDetectionEnabled, vscode.ConfigurationTarget.Global),
            config.update('burstDetectionWindowMs', typeof windowMs === 'number' && Number.isFinite(windowMs) ? Math.min(5000, Math.max(50, windowMs)) : next.burstDetectionWindowMs, vscode.ConfigurationTarget.Global),
            config.update('burstDetectionThreshold', typeof threshold === 'number' && Number.isFinite(threshold) ? Math.min(500, Math.max(2, threshold)) : next.burstDetectionThreshold, vscode.ConfigurationTarget.Global),
            config.update('burstDetectionHoldMs', typeof holdMs === 'number' && Number.isFinite(holdMs) ? Math.min(10000, Math.max(500, holdMs)) : next.burstDetectionHoldMs, vscode.ConfigurationTarget.Global),
        ]);
    }
    loadSupportedFileExtensions() {
        const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
        return this.normalizeSupportedFileExtensions(config.get('supportedFileExtensions', []));
    }
    normalizeSupportedFileExtensions(values) {
        if (!Array.isArray(values)) {
            return [];
        }
        const seen = new Set();
        const normalized = [];
        for (const value of values) {
            if (typeof value !== 'string') {
                continue;
            }
            const ext = value.trim().toLowerCase();
            if (!ext) {
                continue;
            }
            const withDot = ext.startsWith('.') ? ext : `.${ext}`;
            if (!seen.has(withDot)) {
                seen.add(withDot);
                normalized.push(withDot);
            }
        }
        return normalized;
    }
    async saveSupportedFileExtensions(values) {
        const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
        await config.update('supportedFileExtensions', this.normalizeSupportedFileExtensions(values), vscode.ConfigurationTarget.Global);
    }
    resolveWebviewView(webviewView) {
        console.log('[ai-cli-diff-view] terminal:resolveWebviewView:start');
        this.view = webviewView;
        this.panel = undefined;
        this.attachWebview(webviewView.webview);
        console.log('[ai-cli-diff-view] terminal:resolveWebviewView:complete');
    }
    openWebviewPanel() {
        const panel = vscode.window.createWebviewPanel(TerminalPanelProvider.panelViewType, 'Agent Terminal', vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        this.panel = panel;
        this.view = undefined;
        this.attachWebview(panel.webview);
        panel.onDidDispose(() => {
            this.panel = undefined;
            this.dispose();
        }, null, this.context.subscriptions);
        return panel;
    }
    startFresh() {
        this.disposeSessions();
        this.render();
    }
    resetSessions() {
        this.disposeSessions();
    }
    attachWebview(webview) {
        this.webview = webview;
        const xtermDir = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'xterm');
        const iconsDir = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'file-icons');
        const introDir = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'introduce');
        const monacoDir = vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'monaco-editor', 'min');
        const webviewDir = vscode.Uri.joinPath(this.context.extensionUri, 'res', 'webview');
        webview.options = {
            enableScripts: true,
            localResourceRoots: [xtermDir, iconsDir, introDir, monacoDir, webviewDir],
        };
        this.webviewMessageDisposable?.dispose();
        this.webviewMessageDisposable = webview.onDidReceiveMessage((msg) => {
            if (!msg || typeof msg !== 'object') {
                return;
            }
            switch (msg.type) {
                case 'toggleAgentMode':
                    console.log('[ai-cli-diff-view] terminal:toggleAgentMode');
                    void vscode.commands.executeCommand('ai-cli-diff-view.toggleAgentMode');
                    return;
                case 'showPendingFiles':
                    void vscode.commands.executeCommand('ai-cli-diff-view.showPendingFiles');
                    return;
                case 'ready':
                    // Push initial files page state once the webview is ready.
                    this.postFilesUpdate();
                    this.setAgentMode(this.agentModeActive);
                    if (this.focusWhenReady) {
                        this.focusWhenReady = false;
                        void this.webview?.postMessage({ type: 'focusTerminal' });
                    }
                    if (this.pendingAgentFilePath) {
                        const filePath = this.pendingAgentFilePath;
                        this.pendingAgentFilePath = undefined;
                        void this.webview?.postMessage({ type: 'showDiffPreview', path: filePath });
                    }
                    if (this.pendingAgentFilePreviewPath) {
                        const filePath = this.pendingAgentFilePreviewPath;
                        this.pendingAgentFilePreviewPath = undefined;
                        void this.webview?.postMessage({ type: 'showFilePreview', path: filePath });
                    }
                    if (!this.context.globalState.get(INTRODUCE_SEEN_KEY)) {
                        void this.webview?.postMessage({ type: 'showIntroduce' });
                    }
                    return;
                case 'createSession':
                    this.spawnSession(msg.cols, msg.rows);
                    return;
                case 'closeSession':
                    this.closeSessionInternal(msg.id);
                    if (this.sessions.size === 0) {
                        this.spawnSession(80, 24);
                    }
                    return;
                case 'input':
                    this.sessions.get(msg.id)?.pty.write(msg.data);
                    return;
                case 'resize': {
                    const rec = this.sessions.get(msg.id);
                    if (rec) {
                        rec.cols = Math.max(1, msg.cols | 0);
                        rec.rows = Math.max(1, msg.rows | 0);
                        rec.pty.resize(rec.cols, rec.rows);
                    }
                    return;
                }
                case 'restart': {
                    const old = this.sessions.get(msg.id);
                    if (!old) {
                        return;
                    }
                    const { cols, rows, title } = old;
                    // Dispose old pty + subs but keep the id; emit data/exit/error under the same id.
                    for (const d of old.subs) {
                        try {
                            d.dispose();
                        }
                        catch { /* ignore */ }
                    }
                    try {
                        old.pty.dispose();
                    }
                    catch { /* ignore */ }
                    this.sessions.delete(msg.id);
                    const pty = new ptySession_1.PtySession();
                    const id = msg.id;
                    const subs = [
                        pty.onData((data) => {
                            this.webview?.postMessage({ type: 'data', id, data });
                        }),
                        pty.onExit((code) => {
                            this.webview?.postMessage({ type: 'exit', id, code });
                        }),
                        pty.onError((message) => {
                            this.webview?.postMessage({ type: 'error', id, message });
                        }),
                    ];
                    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
                    pty.start(cwd, cols, rows);
                    this.sessions.set(id, { pty, subs, title, cols, rows });
                    return;
                }
                case 'getSettings':
                    this.webview?.postMessage({ type: 'settings', settings: this.loadSettingsPayload() });
                    return;
                case 'installFont': {
                    const font = (0, fontInstaller_1.findInstallableForPrimary)(msg.primary || '');
                    if (!font) {
                        this.webview?.postMessage({
                            type: 'installError',
                            primary: msg.primary,
                            error: 'No installer registered for this font.',
                        });
                        return;
                    }
                    const primary = font.primary;
                    this.webview?.postMessage({
                        type: 'installProgress',
                        primary,
                        message: 'Starting…',
                    });
                    void (0, fontInstaller_1.installFont)(font, (m) => {
                        this.webview?.postMessage({ type: 'installProgress', primary, message: m });
                    }).then((result) => {
                        this.webview?.postMessage({
                            type: 'installDone',
                            primary,
                            targetDir: result.targetDir,
                            restartRecommended: result.restartRecommended,
                        });
                    }).catch((err) => {
                        const message = err instanceof Error ? err.message : String(err);
                        this.webview?.postMessage({ type: 'installError', primary, error: message });
                    });
                    return;
                }
                case 'reloadWindow':
                    void vscode.commands.executeCommand('workbench.action.reloadWindow');
                    return;
                case 'promptFileExtensions': {
                    const isEdit = msg.action === 'edit';
                    void vscode.window.showInputBox({
                        title: isEdit ? 'Edit file extension' : 'New file extension',
                        prompt: isEdit
                            ? 'Enter one file extension.'
                            : 'Enter one extension or multiple extensions separated by commas.',
                        value: isEdit && typeof msg.value === 'string' ? msg.value : '',
                        placeHolder: isEdit ? '.env' : '.env, .blade.php, .proto',
                    }).then((value) => {
                        if (typeof value !== 'string') {
                            return;
                        }
                        this.webview?.postMessage({
                            type: 'fileExtensionsPromptResult',
                            action: msg.action,
                            previousValue: msg.value,
                            value,
                        });
                    });
                    return;
                }
                case 'updateSettings': {
                    const next = this.loadSettings();
                    const incoming = msg.settings ?? next;
                    const sanitized = {
                        fontFamily: typeof incoming.fontFamily === 'string' && incoming.fontFamily.trim()
                            ? incoming.fontFamily
                            : next.fontFamily,
                        fontSize: typeof incoming.fontSize === 'number' && incoming.fontSize >= 6 && incoming.fontSize <= 32
                            ? incoming.fontSize
                            : next.fontSize,
                        themePreset: this.normalizePreset(incoming.themePreset),
                        customColors: {
                            background: this.normalizeColor(incoming.customColors?.background, next.customColors.background),
                            foreground: this.normalizeColor(incoming.customColors?.foreground, next.customColors.foreground),
                            cursor: this.normalizeColor(incoming.customColors?.cursor, next.customColors.cursor),
                        },
                        cursorStyle: this.normalizeCursorStyle(incoming.cursorStyle),
                        cursorBlink: typeof incoming.cursorBlink === 'boolean' ? incoming.cursorBlink : next.cursorBlink,
                    };
                    void Promise.all([
                        this.saveSettings(sanitized),
                        this.saveSupportedFileExtensions(incoming.supportedFileExtensions),
                        this.saveBurstDetectionSettings(incoming),
                        this.saveSoundNotificationSettings(incoming),
                        this.saveFileLimitSettings(incoming),
                    ]).then(() => {
                        this.webview?.postMessage({ type: 'settings', settings: this.loadSettingsPayload() });
                    });
                    return;
                }
                case 'openFile':
                    if (msg.path && typeof msg.path === 'string') {
                        if (!this.openFileInAgent(msg.path)) {
                            void vscode.commands.executeCommand('ai-cli-diff-view.openPendingFile', msg.path);
                        }
                    }
                    return;
                case 'requestDiffPreview':
                    this.diffPreviewOpen = true;
                    this._onDidChangePreviewVisibility.fire(true);
                    this.postDiffPreviewFiles();
                    return;
                case 'closeDiffPreview':
                    this.diffPreviewOpen = false;
                    this._onDidChangePreviewVisibility.fire(false);
                    this._onDidChangePreviewActiveFile.fire(undefined);
                    return;
                case 'previewActiveFile':
                    this._onDidChangePreviewActiveFile.fire(msg.path);
                    return;
                case 'requestFilePreview':
                    this.filePreviewOpen = true;
                    this._onDidChangePreviewVisibility.fire(true);
                    this.filePreviewPath = msg.path;
                    void this.postFilePreview(msg.path).catch((err) => {
                        this.postFilePreviewError(msg.path, err);
                    });
                    return;
                case 'closeFilePreview':
                    this.filePreviewOpen = false;
                    this._onDidChangePreviewVisibility.fire(false);
                    this.filePreviewPath = undefined;
                    return;
                case 'filePreviewEdit':
                    void this.applyFilePreviewEdit(msg.path, msg.content).catch((err) => {
                        this.postFilePreviewError(msg.path, err);
                    });
                    return;
                case 'filePreviewSave':
                    void this.saveFilePreview(msg.path).catch((err) => {
                        this.postFilePreviewError(msg.path, err);
                    });
                    return;
                case 'requestDiffPreviewFile':
                    void this.postDiffPreviewFile(msg.path);
                    return;
                case 'previewEditModified':
                    void this.diffManager.applyPreviewEdit(msg.path, msg.newCurrent).catch((err) => {
                        this.postDiffPreviewError(msg.path, err);
                    });
                    return;
                case 'previewSaveFile':
                    void this.diffManager.savePreviewFile(msg.path).catch((err) => {
                        this.postDiffPreviewError(msg.path, err);
                    });
                    return;
                case 'previewAcceptHunk':
                    void this.diffManager.acceptHunkFromPreview(msg.path, msg.newOriginal, msg.newCurrent)
                        .catch((err) => this.postDiffPreviewError(msg.path, err));
                    return;
                case 'previewRejectHunk':
                    void this.diffManager.rejectHunkFromPreview(msg.path, msg.newOriginal, msg.newCurrent)
                        .catch((err) => this.postDiffPreviewError(msg.path, err));
                    return;
                case 'previewAcceptFile':
                    void this.diffManager.acceptFromPreview(msg.path)
                        .catch((err) => this.postDiffPreviewError(msg.path, err));
                    return;
                case 'previewRejectFile':
                    void this.diffManager.revertFromPreview(msg.path)
                        .catch((err) => this.postDiffPreviewError(msg.path, err));
                    return;
                case 'introduceSeen':
                    void this.context.globalState.update(INTRODUCE_SEEN_KEY, true);
                    return;
                case 'terminalFocusState':
                    this.lastTerminalFocused = !!msg.focused;
                    return;
                case 'viewTooNarrow':
                    // Webview reports its width dropped below ~1/4 of screen width.
                    // Close the auxiliary bar (where extension.ts moves the panel on first run).
                    // Best-effort: if user moved the panel elsewhere, this still tries the aux bar.
                    if (this.view) {
                        void vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
                    }
                    return;
            }
        });
        this.render();
    }
    render() {
        if (!this.webview) {
            return;
        }
        const filesInner = (0, pendingFilesPage_1.buildPendingFilesInnerHtml)({
            diffManager: this.diffManager,
            iconBase: this.fileIconsBase(),
            sessionState: this.sessionState,
            lastPrompt: this.lastPrompt,
            errorMessage: this.errorMessage,
        });
        this.webview.html = (0, terminalHtml_1.buildTerminalHtml)({
            webview: this.webview,
            extensionUri: this.context.extensionUri,
            filesInnerHtml: filesInner,
        });
    }
    postDiffPreviewFiles() {
        if (!this.webview || !this.diffPreviewOpen) {
            return;
        }
        const files = this.diffManager.getPendingFiles().map((filePath) => ({
            path: filePath,
            label: this.displayPath(filePath),
        }));
        void this.webview.postMessage({ type: 'diffPreviewFiles', files });
    }
    async postDiffPreviewFile(filePath) {
        if (!this.webview || !this.diffPreviewOpen) {
            return;
        }
        const file = await this.diffManager.getDiffPreviewFile(filePath);
        if (!this.webview || !this.diffPreviewOpen) {
            return;
        }
        void this.webview.postMessage({
            type: 'diffPreviewFile',
            path: filePath,
            file,
            theme: currentMonacoTheme(),
        });
    }
    postDiffPreviewError(filePath, error) {
        const message = error instanceof Error ? error.message : String(error);
        void this.webview?.postMessage({ type: 'diffPreviewError', path: filePath, message });
    }
    async postFilePreview(filePath) {
        if (!this.webview || !this.filePreviewOpen) {
            return;
        }
        const uri = vscode.Uri.file(filePath);
        const mimeType = imageMimeType(filePath);
        if (mimeType) {
            const bytes = await vscode.workspace.fs.readFile(uri);
            if (!this.webview || !this.filePreviewOpen) {
                return;
            }
            void this.webview.postMessage({
                type: 'filePreviewData',
                kind: 'image',
                path: filePath,
                label: this.displayPath(filePath),
                mimeType,
                data: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`,
            });
            return;
        }
        const openDocument = vscode.workspace.textDocuments.find((document) => document.uri.fsPath === filePath);
        const document = openDocument ?? await vscode.workspace.openTextDocument(uri);
        if (!this.webview || !this.filePreviewOpen) {
            return;
        }
        void this.webview.postMessage({
            type: 'filePreviewData',
            path: filePath,
            label: this.displayPath(filePath),
            content: document.getText(),
            language: document.languageId,
            theme: currentMonacoTheme(),
        });
    }
    async applyFilePreviewEdit(filePath, content) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), content);
        await vscode.workspace.applyEdit(edit);
    }
    async saveFilePreview(filePath) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await document.save();
    }
    postFilePreviewError(filePath, error) {
        const message = error instanceof Error ? error.message : String(error);
        void this.webview?.postMessage({ type: 'filePreviewError', path: filePath, message });
    }
    displayPath(filePath) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
        if (!workspaceFolder) {
            return path.basename(filePath);
        }
        const relative = path.relative(workspaceFolder.uri.fsPath, filePath);
        return relative || path.basename(filePath);
    }
    dispose() {
        this.disposeSessions();
        this.webviewMessageDisposable?.dispose();
        this.webviewMessageDisposable = undefined;
        this.webview = undefined;
        this.view = undefined;
        this.panel = undefined;
        this.focusWhenReady = false;
        this.diffDisposable?.dispose();
        this.diffDisposable = undefined;
        this.workspaceDiffDisposable?.dispose();
        this.workspaceDiffDisposable = undefined;
        this.themeDisposable?.dispose();
        this.themeDisposable = undefined;
        this.diffPreviewOpen = false;
        this.filePreviewOpen = false;
        this.filePreviewPath = undefined;
        this.pendingAgentFilePath = undefined;
        this.pendingAgentFilePreviewPath = undefined;
        this._onDidChangePreviewActiveFile.dispose();
        this._onDidChangePreviewVisibility.dispose();
    }
    disposeSessions() {
        for (const rec of this.sessions.values()) {
            for (const d of rec.subs) {
                try {
                    d.dispose();
                }
                catch { /* ignore */ }
            }
            try {
                rec.pty.dispose();
            }
            catch { /* ignore */ }
        }
        this.sessions.clear();
    }
}
exports.TerminalPanelProvider = TerminalPanelProvider;
TerminalPanelProvider.viewType = 'ai-cli-diff-view.terminal';
TerminalPanelProvider.panelViewType = 'ai-cli-diff-view.terminalPanel';
function resolveShellName() {
    const shell = vscode.env.shell ||
        process.env['ComSpec'] ||
        (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
    const base = path.basename(shell);
    return base.replace(/\.exe$/i, '');
}
function currentMonacoTheme() {
    switch (vscode.window.activeColorTheme.kind) {
        case vscode.ColorThemeKind.Light: return 'vs';
        case vscode.ColorThemeKind.HighContrast: return 'hc-black';
        case vscode.ColorThemeKind.HighContrastLight: return 'hc-light';
        default: return 'vs-dark';
    }
}
//# sourceMappingURL=terminalPanel.js.map