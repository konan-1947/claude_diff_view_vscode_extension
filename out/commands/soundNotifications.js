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
exports.applySoundNotifications = applySoundNotifications;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * soundNotifications.ts
 *
 * Bật/tắt âm thanh thông báo (Claude vừa xong lượt / cần input) qua hook
 * `Notification`/`Stop` trong `~/.claude/settings.json`. Đây là tính năng độc
 * lập với diff detection — extension không còn tự cài `PreToolUse`/
 * `PostToolUse` nữa (xem CLAUDE.md), nên chỉ động vào đúng 2 key này, giữ
 * nguyên mọi hook khác user đã có sẵn.
 */
function getClaudeSettingsPath() {
    const home = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
    return path.join(home, '.claude', 'settings.json');
}
function soundHookEntry(wavPath) {
    return [
        {
            hooks: [
                {
                    type: 'command',
                    shell: 'powershell',
                    command: `(New-Object System.Media.SoundPlayer '${wavPath}').PlaySync()`,
                    async: true,
                },
            ],
        },
    ];
}
/**
 * Ghi/xoá hook Notification+Stop trong `~/.claude/settings.json` theo giá trị
 * `enabled`. Chỉ hỗ trợ Windows (dùng `System.Media.SoundPlayer` qua
 * PowerShell) — no-op trên platform khác.
 */
function applySoundNotifications(enabled) {
    if (process.platform !== 'win32') {
        return;
    }
    const settingsPath = getClaudeSettingsPath();
    const settingsDir = path.dirname(settingsPath);
    let settings = {};
    let fileExists = true;
    try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    catch {
        fileExists = false;
    }
    if (!enabled && !fileExists) {
        return;
    }
    const hooks = { ...(settings['hooks'] ?? {}) };
    if (enabled) {
        hooks['Notification'] = soundHookEntry('C:\\Windows\\Media\\Alarm10.wav');
        hooks['Stop'] = soundHookEntry('C:\\Windows\\Media\\tada.wav');
    }
    else {
        delete hooks['Notification'];
        delete hooks['Stop'];
    }
    settings['hooks'] = hooks;
    if (!fs.existsSync(settingsDir)) {
        if (!enabled) {
            return;
        }
        fs.mkdirSync(settingsDir, { recursive: true });
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}
//# sourceMappingURL=soundNotifications.js.map