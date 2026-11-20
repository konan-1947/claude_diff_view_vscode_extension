import type * as ClaudeAgentSdk from '@anthropic-ai/claude-agent-sdk';

type SdkModule = typeof ClaudeAgentSdk;

let cached: Promise<SdkModule> | undefined;

/**
 * The Agent SDK is ESM-only while the extension host is CommonJS. A literal
 * `import()` is rewritten to `require()` by bundlers targeting CommonJS, which
 * fails on an ESM package, so the specifier is hidden behind `new Function`.
 *
 * The package is marked external in `esbuild.cjs` and shipped inside the VSIX,
 * so Node resolves it from the extension's `node_modules` at runtime.
 */
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<SdkModule>;

export function loadClaudeSdk(): Promise<SdkModule> {
  if (!cached) {
    cached = dynamicImport('@anthropic-ai/claude-agent-sdk').catch((error: unknown) => {
      // Do not cache a failure: the user may fix the installation and retry.
      cached = undefined;
      throw error;
    });
  }
  return cached;
}

/** Test hook: forget the cached module (used by unit tests). */
export function resetClaudeSdkCache(): void {
  cached = undefined;
}
