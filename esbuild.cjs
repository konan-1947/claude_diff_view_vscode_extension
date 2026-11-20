#!/usr/bin/env node
const esbuild = require('esbuild');
const path = require('path');
const { spawn } = require('child_process');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Claude UI webview (Vue app in webview-ui/claude), built by Vite into
 * dist/claude-ui. It is a separate process; `npm run compile`/`build`/`watch`
 * all run it after (or next to) the extension host bundle.
 */
const viteBin = path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');
const viteArgs = ['build', '--config', path.join('webview-ui', 'claude', 'vite.config.mts')];

// Watch mode: the `npm: watch` background problemMatcher (.vscode/tasks.json)
// waits for "[watch] build started" / "[watch] build finished". Two builds run
// (esbuild here, Vite in a child), so the markers are counted and printed once:
// "finished" only when neither is still building. Without the markers VS Code
// never learns the task is ready and asks "task has not exited..." on every F5.
let activeBuilds = 0;
function buildBegan() {
  if (activeBuilds++ === 0) {
    console.log('[watch] build started');
  }
}
function buildEnded() {
  activeBuilds = Math.max(0, activeBuilds - 1);
  if (activeBuilds === 0) {
    console.log('[watch] build finished');
  }
}

const watchReporter = {
  name: 'watch-reporter',
  setup(build) {
    build.onStart(() => {
      buildBegan();
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        if (location) {
          console.error(`${location.file}:${location.line}:${location.column}: error: ${text}`);
        } else {
          console.error(`error: ${text}`);
        }
      }
      buildEnded();
    });
  }
};

function runVite() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [viteBin, ...viteArgs], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`vite build exited with ${code}`))));
  });
}

/** Vite --watch in a child; its own markers are folded into the shared count. */
function watchVite() {
  // Counted from spawn: esbuild must not report "finished" before Vite's first build.
  buildBegan();
  let firstBuild = true;
  const child = spawn(process.execPath, [viteBin, ...viteArgs, '--watch'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('[watch] build started')) {
        if (!firstBuild) buildBegan();
      } else if (line.startsWith('[watch] build finished')) {
        firstBuild = false;
        buildEnded();
      } else if (line.trim()) {
        console.log(`[vite] ${line}`);
      }
    }
  });
  child.on('exit', (code) => {
    console.error(`[vite] watcher exited with ${code}`);
    process.exit(code ?? 1);
  });
  process.on('exit', () => child.kill());
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      child.kill();
      process.exit(0);
    });
  }
}

/**
 * Extension host bundle.
 *
 * Everything the host needs is bundled into a single CommonJS file so that
 * ESM-only dependencies (the Claude Agent SDK) can be consumed from VS Code's
 * CommonJS extension host.
 *
 * Kept external:
 * - `vscode`            provided by the extension host at runtime
 * - `node-pty`          native module, must be loaded from node_modules
 * - `@anthropic-ai/claude-agent-sdk`  ESM package; loaded with a native
 *                       dynamic import() so its own module graph stays intact
 */
const options = {
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode', 'node-pty', '@anthropic-ai/claude-agent-sdk'],
  sourcemap: production ? 'external' : 'inline',
  sourcesContent: !production,
  minify: production,
  keepNames: true,
  logLevel: watch ? 'silent' : 'info',
  plugins: watch ? [watchReporter] : [],
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': production ? '"production"' : '"development"'
  }
};

async function main() {
  if (watch) {
    // Vite is counted first, so esbuild's quick first build cannot report "finished" alone.
    watchVite();
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[esbuild] watching src/extension.ts');
    return;
  }

  await esbuild.build(options);
  console.log(`[esbuild] built dist/extension.cjs (${production ? 'production' : 'development'})`);
  await runVite();
  console.log('[vite] built dist/claude-ui');
}

main().catch((error) => {
  console.error('[esbuild] build failed');
  console.error(error);
  process.exit(1);
});
