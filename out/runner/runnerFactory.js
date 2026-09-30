"use strict";
/**
 * runnerFactory.ts
 *
 * Detects supported AI CLI launchers and returns the matching runner.
 */
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
exports.createRunner = createRunner;
const cp = __importStar(require("child_process"));
const claudeRunner_1 = require("./claudeRunner");
function isToolAvailable(tool) {
    const lookupCmd = process.platform === 'win32' ? 'where' : 'which';
    try {
        const result = cp.spawnSync(lookupCmd, [tool], {
            encoding: 'utf8',
            timeout: 3000,
        });
        return result.status === 0 && !!result.stdout.trim();
    }
    catch {
        return false;
    }
}
function detectAvailableTools() {
    const available = [];
    if (isToolAvailable('claude')) {
        available.push('claude');
    }
    return available;
}
async function createRunner(diffManager, preferredTool) {
    if (preferredTool) {
        return {
            runner: buildRunner(preferredTool, diffManager),
            toolName: preferredTool,
        };
    }
    const available = detectAvailableTools();
    if (available.length === 0) {
        throw new Error('No supported AI CLI launcher found on PATH.\n' +
            'Best supported review workflows: Claude, Codex, and Qwen.\n' +
            'Built-in session launch currently requires Claude Code:\n' +
            '  • Claude Code: https://claude.ai/code');
    }
    const tool = available[0];
    return { runner: buildRunner(tool, diffManager), toolName: tool };
}
function buildRunner(tool, diffManager) {
    switch (tool) {
        case 'claude':
        default:
            return new claudeRunner_1.ClaudeRunner(diffManager);
    }
}
//# sourceMappingURL=runnerFactory.js.map