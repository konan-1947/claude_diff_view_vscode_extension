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
exports.isExcludedPathSegment = isExcludedPathSegment;
/**
 * Path segments to skip for workspace snapshot + external-write diff triggers.
 * Match whole path components (e.g. .../obj/foo.json → skip because of `obj`).
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const EXCLUDED_SEGMENTS = new Set([
    'node_modules',
    '.git',
    '.next',
    '.nuxt',
    'out',
    'dist',
    'build',
    '.vscode',
    '.idea',
    '.claude',
    // .NET / Visual Studio
    'bin',
    'obj',
    'TestResults',
    'artifacts',
    '.vs',
    // Java / JVM
    'target',
    '.gradle',
    '.settings',
    '.classpath',
    '.project',
    // Python
    'venv',
    '.venv',
    'env',
    '.env',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    '.ruff_cache',
    'site-packages',
    'dist-info',
    'egg-info',
]);
/**
 * Cache parentDir -> boolean: whether `<parentDir>/packages` is a legacy NuGet
 * solution folder. A NuGet `packages/` folder is always a sibling of a `.sln`
 * file. Anything else named `packages/` (npm/pnpm/yarn workspaces, lerna, …)
 * is real source we must NOT exclude.
 */
const nugetPackagesCache = new Map();
function isNugetPackagesParent(parentDir) {
    const cached = nugetPackagesCache.get(parentDir);
    if (cached !== undefined) {
        return cached;
    }
    let result = false;
    try {
        for (const entry of fs.readdirSync(parentDir)) {
            if (entry.toLowerCase().endsWith('.sln')) {
                result = true;
                break;
            }
        }
    }
    catch {
        result = false;
    }
    nugetPackagesCache.set(parentDir, result);
    return result;
}
function isExcludedPathSegment(absPath) {
    const parts = absPath.split(path.sep);
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (EXCLUDED_SEGMENTS.has(p)) {
            return true;
        }
        if (p === 'packages' && i > 0) {
            const parentDir = parts.slice(0, i).join(path.sep);
            if (isNugetPackagesParent(parentDir)) {
                return true;
            }
        }
    }
    return false;
}
//# sourceMappingURL=pathExclusions.js.map