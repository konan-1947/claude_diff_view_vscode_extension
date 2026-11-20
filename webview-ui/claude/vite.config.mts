import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Claude UI webview (Vue app from uic / Claudix).
 *
 * The bundle is not loaded by URL: the terminal webview fetches main.js and
 * style.css once and inlines them into each Claude UI tab's `<iframe srcdoc>`.
 * An about:srcdoc document has no base URL of its own, so the build must be a
 * single chunk with every asset (fonts) inlined as a data: URI.
 */

/** Keep only the woff2 source of the Material Design Icons font (drops eot/woff/ttf). */
function mdiWoff2Only(): Plugin {
  return {
    name: 'mdi-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('materialdesignicons') || !id.endsWith('.css')) {
        return null;
      }
      return code.replace(
        /@font-face\{font-family:"Material Design Icons";[^}]*\}/,
        '@font-face{font-family:"Material Design Icons";src:url("../fonts/materialdesignicons-webfont.woff2?v=7.4.47") format("woff2");font-weight:normal;font-style:normal}'
      );
    },
  };
}

/** Prints the markers the `npm: watch` background problemMatcher waits for. */
function watchMarkers(): Plugin {
  return {
    name: 'watch-markers',
    apply: 'build',
    buildStart() {
      if (this.meta.watchMode) {
        console.log('[watch] build started');
      }
    },
    buildEnd(error) {
      // closeBundle does not run after a failed build; report the end here instead.
      if (error && this.meta.watchMode) {
        console.log('[watch] build finished');
      }
    },
    closeBundle() {
      if (this.meta.watchMode) {
        console.log('[watch] build finished');
      }
    },
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [
    mdiWoff2Only(),
    vue(),
    tailwindcss(),
    watchMarkers(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../src/claude/shared'),
      // uic ships its own codicon build (extra glyphs such as arrow-up-two, at-sign,
      // asterisk); the @vscode/codicons package lacks them, so keep upstream's alias.
      '@vscode/codicons/dist/codicon.css': path.resolve(__dirname, 'assets/codicons/codicon.css'),
      '@vscode/codicons/dist/codicon.ttf': path.resolve(__dirname, 'assets/codicons/codicon.ttf'),
    },
  },
  base: '',
  logLevel: 'warn',
  build: {
    outDir: path.resolve(__dirname, '../../dist/claude-ui'),
    emptyOutDir: true,
    assetsDir: '',
    sourcemap: false,
    // Inline everything: the srcdoc iframe cannot resolve relative asset URLs.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 8192,
    rolldownOptions: {
      input: path.resolve(__dirname, 'src/main.ts'),
      output: {
        entryFileNames: 'main.js',
        codeSplitting: false,
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? '';
          return name.endsWith('.css') ? 'style.css' : '[name][extname]';
        },
      },
    },
  },
});
