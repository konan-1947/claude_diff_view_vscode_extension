/**
 * Mermaid diagrams in chat messages.
 *
 * The library is not bundled: dist/claude-ui is a single chunk inlined into
 * every tab's iframe, and mermaid is ~3 MB. The terminal webview around the
 * iframe already loads it on demand for the Agent mode preview
 * (res/webview/preview/mermaid.js), and the iframe (srcdoc or blob:) is
 * same-origin with it, so diagrams are drawn there and the SVG string comes
 * back. Outside that host (plain Vite dev page) rendering rejects and the
 * caller keeps the code block.
 */

type MermaidTheme = 'default' | 'dark';

interface HostMermaid {
  renderSvg(source: string, theme?: MermaidTheme): Promise<string>;
}

export interface MermaidResult {
  svg?: string;
  error?: string;
}

/** Keyed by theme + source: one render per diagram, shared by every message and re-render */
const cache = new Map<string, MermaidResult>();
const inFlight = new Map<string, Promise<void>>();

function hostMermaid(): HostMermaid | undefined {
  try {
    if (window.parent === window) return undefined;
    return (window.parent as unknown as { aiCliPreviewMermaid?: HostMermaid }).aiCliPreviewMermaid;
  } catch {
    // Cross-origin parent
    return undefined;
  }
}

/** Light or dark from the transcript's own background (Claude UI can override the VS Code theme) */
export function currentMermaidTheme(): MermaidTheme {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;background:var(--vscode-editor-background)';
  document.body.appendChild(probe);
  const bg = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const m = bg.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!m) {
    const light = document.body.classList.contains('vscode-light') || document.body.classList.contains('vscode-high-contrast-light');
    return light ? 'default' : 'dark';
  }
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? 'default' : 'dark';
}

export function mermaidKey(source: string, theme: MermaidTheme): string {
  return theme + '\n' + source;
}

/** The finished render, if any (synchronous: lets the markdown emit the SVG with no flash) */
export function cachedMermaid(key: string): MermaidResult | undefined {
  return cache.get(key);
}

/** Renders once per key; resolves when cachedMermaid(key) is filled */
export function renderMermaid(source: string, theme: MermaidTheme): Promise<void> {
  const key = mermaidKey(source, theme);
  if (cache.has(key)) return Promise.resolve();
  let job = inFlight.get(key);
  if (!job) {
    const host = hostMermaid();
    job = (host ? host.renderSvg(source, theme) : Promise.reject(new Error('Mermaid is not available here')))
      .then(
        svg => { cache.set(key, { svg }); },
        (e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          cache.set(key, { error: message.split('\n')[0] || 'Could not render the diagram' });
        }
      )
      .finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return job;
}
