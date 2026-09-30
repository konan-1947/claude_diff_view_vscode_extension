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
exports.detectLanguageId = detectLanguageId;
const path = __importStar(require("path"));
function detectLanguageId(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.ts':
        case '.tsx': return 'typescript';
        case '.js':
        case '.jsx':
        case '.mjs':
        case '.cjs': return 'javascript';
        case '.json': return 'json';
        case '.html':
        case '.htm': return 'html';
        case '.css': return 'css';
        case '.scss': return 'scss';
        case '.less': return 'less';
        case '.md':
        case '.markdown': return 'markdown';
        case '.py': return 'python';
        case '.go': return 'go';
        case '.rs': return 'rust';
        case '.java': return 'java';
        case '.kt':
        case '.kts': return 'kotlin';
        case '.c':
        case '.h': return 'c';
        case '.cpp':
        case '.cc':
        case '.cxx':
        case '.hpp': return 'cpp';
        case '.cs': return 'csharp';
        case '.php': return 'php';
        case '.rb': return 'ruby';
        case '.sh':
        case '.bash':
        case '.zsh': return 'shell';
        case '.yaml':
        case '.yml': return 'yaml';
        case '.xml': return 'xml';
        case '.sql': return 'sql';
        case '.swift': return 'swift';
        case '.lua': return 'lua';
        case '.dart': return 'dart';
        case '.vue': return 'html';
        default: return 'plaintext';
    }
}
//# sourceMappingURL=language.js.map