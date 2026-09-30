"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = exports.MAX_FILE_LINES_CEILING = exports.DEFAULT_FILE_LIMIT_SETTINGS = exports.DEFAULT_SOUND_NOTIFICATION_SETTINGS = exports.DEFAULT_BURST_DETECTION_SETTINGS = void 0;
exports.DEFAULT_BURST_DETECTION_SETTINGS = {
    burstDetectionEnabled: true,
    burstDetectionWindowMs: 300,
    burstDetectionThreshold: 8,
    burstDetectionHoldMs: 2000,
};
exports.DEFAULT_SOUND_NOTIFICATION_SETTINGS = {
    soundNotificationsEnabled: false,
};
exports.DEFAULT_FILE_LIMIT_SETTINGS = {
    maxFileLines: 5000,
};
/** 0 = tắt giới hạn. Trần trên chỉ để chặn nhập nhầm, không phải khuyến nghị. */
exports.MAX_FILE_LINES_CEILING = 200000;
exports.DEFAULT_SETTINGS = {
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 13,
    themePreset: 'vscode',
    customColors: { background: '#1e1e1e', foreground: '#cccccc', cursor: '#ffffff' },
    cursorStyle: 'block',
    cursorBlink: true,
};
//# sourceMappingURL=terminalTypes.js.map