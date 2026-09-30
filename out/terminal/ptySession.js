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
exports.PtySession = void 0;
const os = __importStar(require("os"));
const vscode = __importStar(require("vscode"));
class PtySession {
    constructor() {
        this._onData = new vscode.EventEmitter();
        this.onData = this._onData.event;
        this._onExit = new vscode.EventEmitter();
        this.onExit = this._onExit.event;
        this._onError = new vscode.EventEmitter();
        this.onError = this._onError.event;
    }
    isRunning() {
        return this.proc !== undefined;
    }
    start(cwd, cols, rows) {
        if (this.proc) {
            return;
        }
        let ptyMod;
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            ptyMod = require('node-pty');
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this._onError.fire(`node-pty failed to load: ${msg}`);
            return;
        }
        const shell = vscode.env.shell ||
            process.env['ComSpec'] ||
            (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
        try {
            this.proc = ptyMod.spawn(shell, [], {
                name: 'xterm-256color',
                cols: Math.max(1, cols),
                rows: Math.max(1, rows),
                cwd: cwd || os.homedir(),
                env: { ...process.env },
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this._onError.fire(`failed to spawn ${shell}: ${msg}`);
            return;
        }
        this.proc.onData((d) => this._onData.fire(d));
        this.proc.onExit(({ exitCode }) => {
            this._onExit.fire(exitCode);
            this.proc = undefined;
        });
    }
    write(data) {
        this.proc?.write(data);
    }
    resize(cols, rows) {
        if (!this.proc) {
            return;
        }
        try {
            this.proc.resize(Math.max(1, cols), Math.max(1, rows));
        }
        catch {
            // PTY can be in transient state during shutdown — ignore.
        }
    }
    dispose() {
        try {
            this.proc?.kill();
        }
        catch {
            // ignore
        }
        this.proc = undefined;
        this._onData.dispose();
        this._onExit.dispose();
        this._onError.dispose();
    }
}
exports.PtySession = PtySession;
//# sourceMappingURL=ptySession.js.map