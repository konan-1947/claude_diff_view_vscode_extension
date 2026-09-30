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
exports.INSTALLABLE_FONTS = void 0;
exports.findInstallableForPrimary = findInstallableForPrimary;
exports.installFont = installFont;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const https = __importStar(require("https"));
const url_1 = require("url");
const util_1 = require("util");
const child_process_1 = require("child_process");
const execFileP = (0, util_1.promisify)(child_process_1.execFile);
// Curated list of popular dev fonts with stable direct .ttf URLs.
// Cascadia Code, Roboto Mono, Ubuntu Mono, SF Mono are omitted (zip-only or
// Google Fonts CSS parsing required) — they remain in the dropdown but without
// an install button.
exports.INSTALLABLE_FONTS = {
    'fira code': {
        id: 'fira code',
        displayName: 'Fira Code',
        primary: 'Fira Code',
        files: [
            {
                url: 'https://github.com/tonsky/FiraCode/raw/master/distr/ttf/FiraCode-Regular.ttf',
                filename: 'FiraCode-Regular.ttf',
                regName: 'Fira Code Regular (TrueType)',
            },
            {
                url: 'https://github.com/tonsky/FiraCode/raw/master/distr/ttf/FiraCode-Bold.ttf',
                filename: 'FiraCode-Bold.ttf',
                regName: 'Fira Code Bold (TrueType)',
            },
        ],
    },
    'jetbrains mono': {
        id: 'jetbrains mono',
        displayName: 'JetBrains Mono',
        primary: 'JetBrains Mono',
        files: [
            {
                url: 'https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf/JetBrainsMono-Regular.ttf',
                filename: 'JetBrainsMono-Regular.ttf',
                regName: 'JetBrains Mono Regular (TrueType)',
            },
            {
                url: 'https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf/JetBrainsMono-Bold.ttf',
                filename: 'JetBrainsMono-Bold.ttf',
                regName: 'JetBrains Mono Bold (TrueType)',
            },
        ],
    },
    'source code pro': {
        id: 'source code pro',
        displayName: 'Source Code Pro',
        primary: 'Source Code Pro',
        files: [
            {
                url: 'https://github.com/adobe-fonts/source-code-pro/raw/release/TTF/SourceCodePro-Regular.ttf',
                filename: 'SourceCodePro-Regular.ttf',
                regName: 'Source Code Pro Regular (TrueType)',
            },
            {
                url: 'https://github.com/adobe-fonts/source-code-pro/raw/release/TTF/SourceCodePro-Bold.ttf',
                filename: 'SourceCodePro-Bold.ttf',
                regName: 'Source Code Pro Bold (TrueType)',
            },
        ],
    },
    'hack': {
        id: 'hack',
        displayName: 'Hack',
        primary: 'Hack',
        files: [
            {
                url: 'https://github.com/source-foundry/Hack/raw/master/build/ttf/Hack-Regular.ttf',
                filename: 'Hack-Regular.ttf',
                regName: 'Hack Regular (TrueType)',
            },
            {
                url: 'https://github.com/source-foundry/Hack/raw/master/build/ttf/Hack-Bold.ttf',
                filename: 'Hack-Bold.ttf',
                regName: 'Hack Bold (TrueType)',
            },
        ],
    },
    'ibm plex mono': {
        id: 'ibm plex mono',
        displayName: 'IBM Plex Mono',
        primary: 'IBM Plex Mono',
        files: [
            {
                url: 'https://github.com/IBM/plex/raw/master/IBM-Plex-Mono/fonts/complete/ttf/IBMPlexMono-Regular.ttf',
                filename: 'IBMPlexMono-Regular.ttf',
                regName: 'IBM Plex Mono Regular (TrueType)',
            },
            {
                url: 'https://github.com/IBM/plex/raw/master/IBM-Plex-Mono/fonts/complete/ttf/IBMPlexMono-Bold.ttf',
                filename: 'IBMPlexMono-Bold.ttf',
                regName: 'IBM Plex Mono Bold (TrueType)',
            },
        ],
    },
};
function findInstallableForPrimary(primary) {
    return exports.INSTALLABLE_FONTS[primary.toLowerCase().trim()];
}
async function installFont(font, onProgress) {
    const targetDir = getFontDir();
    await fs.promises.mkdir(targetDir, { recursive: true });
    for (const file of font.files) {
        onProgress(`Downloading ${file.filename}…`);
        const buf = await downloadBinary(file.url);
        const dest = path.join(targetDir, file.filename);
        await fs.promises.writeFile(dest, buf);
        if (process.platform === 'win32') {
            onProgress(`Registering ${file.filename}…`);
            await registerWindowsFont(file.regName, dest);
        }
    }
    if (process.platform === 'linux') {
        try {
            onProgress('Refreshing font cache…');
            await execFileP('fc-cache', ['-f', targetDir]);
        }
        catch {
            // fc-cache may be missing; the user's font config will pick it up eventually.
        }
    }
    return {
        targetDir,
        // On Windows, Electron caches the system font list at process start, so the
        // font does not become visible to VS Code until restart.
        restartRecommended: process.platform === 'win32',
    };
}
function getFontDir() {
    const home = os.homedir();
    switch (process.platform) {
        case 'win32': {
            const local = process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local');
            return path.join(local, 'Microsoft', 'Windows', 'Fonts');
        }
        case 'darwin':
            return path.join(home, 'Library', 'Fonts');
        default:
            return path.join(home, '.local', 'share', 'fonts');
    }
}
async function registerWindowsFont(regName, filePath) {
    await execFileP('reg', [
        'add',
        'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
        '/v', regName,
        '/t', 'REG_SZ',
        '/d', filePath,
        '/f',
    ]);
}
function downloadBinary(url, redirectsLeft = 6) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new url_1.URL(url);
        }
        catch (e) {
            return reject(e);
        }
        const req = https.get({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            port: parsed.port || 443,
            headers: { 'User-Agent': 'ai-cli-diff-view-vscode' },
        }, (res) => {
            const status = res.statusCode || 0;
            if (status >= 300 && status < 400 && res.headers.location) {
                res.resume();
                if (redirectsLeft <= 0) {
                    return reject(new Error('Too many redirects'));
                }
                const next = new url_1.URL(res.headers.location, url).toString();
                downloadBinary(next, redirectsLeft - 1).then(resolve, reject);
                return;
            }
            if (status !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${status} for ${url}`));
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(45000, () => req.destroy(new Error('Download timeout')));
    });
}
//# sourceMappingURL=fontInstaller.js.map