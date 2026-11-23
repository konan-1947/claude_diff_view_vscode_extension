/**
 * Links clicked anywhere in the chat app. The app runs in an iframe inside the
 * webview, where VS Code's own link handling does not reach: a plain `<a href>`
 * would navigate the iframe away (or be blocked), `target="_blank"` cannot open
 * a popup. So every click on a link is taken here first (capture phase):
 *
 * - `http(s):` / `mailto:` → the system browser (`vscode.env.openExternal`)
 * - a file path (`src/a.ts`, `src/a.ts:42`, `src/a.ts#L10-L20`, `file://…`)
 *   → opened in the editor, at that line
 * - `#…` or an empty href → left alone: components use `href="#"` with their
 *   own click handler, and in-page anchors only scroll
 * - any other scheme (`vscode:`, `command:`, `javascript:`…) → ignored
 */

interface LinkTargets {
  openURL: (url: string) => void;
  openFile: (path: string, location?: { startLine?: number; endLine?: number }) => void;
}

const WEB_LINK = /^(https?:|mailto:)/i;
/** `C:\` / `C:/` is a Windows path, not a scheme */
const OTHER_SCHEME = /^(?![a-z]:[\\/])[a-z][a-z0-9+.-]*:/i;

/** `path:12`, `path:12:3`, `path:12-20`, `path#L12`, `path#L12-L20` */
function splitLocation(raw: string): { path: string; startLine?: number; endLine?: number } {
  const hash = /^(.*)#L(\d+)(?:-L?(\d+))?$/.exec(raw);
  if (hash) {
    return { path: hash[1], startLine: Number(hash[2]), endLine: hash[3] ? Number(hash[3]) : undefined };
  }
  const colon = /^(.*?):(\d+)(?:[:-](\d+))?$/.exec(raw);
  if (colon && colon[1] && !/^[a-z]$/i.test(colon[1])) {
    const isRange = raw.slice(colon[1].length).includes('-');
    return {
      path: colon[1],
      startLine: Number(colon[2]),
      endLine: isRange && colon[3] ? Number(colon[3]) : undefined,
    };
  }
  return { path: raw.replace(/#.*$/, '') };
}

function handle(event: MouseEvent, targets: LinkTargets) {
  if (event.button !== 0 && event.button !== 1) return;
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!anchor) return;
  const href = (anchor.getAttribute('href') ?? '').trim();
  if (!href || href.startsWith('#')) return;

  event.preventDefault();

  if (WEB_LINK.test(href)) {
    targets.openURL(href);
    return;
  }

  let raw = href;
  if (/^file:/i.test(raw)) {
    try {
      const url = new URL(raw);
      raw = decodeURIComponent(url.pathname) + url.hash;
      // file:///C:/x → C:/x
      if (/^\/[a-z]:\//i.test(raw)) raw = raw.slice(1);
    } catch {
      return;
    }
  } else if (OTHER_SCHEME.test(raw)) {
    return;
  } else {
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* keep it as written */
    }
  }

  const { path, startLine, endLine } = splitLocation(raw);
  if (!path) return;
  targets.openFile(path, startLine ? { startLine, endLine: endLine ?? startLine } : undefined);
}

export function installLinkHandler(targets: LinkTargets): () => void {
  const onClick = (e: MouseEvent) => handle(e, targets);
  window.addEventListener('click', onClick, true);
  // Middle click
  window.addEventListener('auxclick', onClick, true);
  return () => {
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('auxclick', onClick, true);
  };
}
