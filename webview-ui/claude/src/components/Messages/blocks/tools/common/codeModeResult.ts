/**
 * Parsing for the Code Mode tools (`REPL`, `Poll`). Their results are plain
 * text with light XML-ish markup written by the CLI; everything inside is
 * untrusted data (script output, file contents), so it is only ever shown as
 * text, never as HTML.
 */

export interface ResultSection {
  kind: 'result' | 'error' | 'log' | 'text';
  text: string;
}

export interface PollEvent {
  kind: string;
  evalId?: string;
  status?: string;
  ms?: string;
  sections: ResultSection[];
}

/** Text of a tool_result: a string, or the text blocks of a content array */
export function toolResultText(toolResult: any): string {
  const content = toolResult?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text)
      .join('\n');
  }
  return '';
}

/** Bookkeeping lines the CLI adds around results, not part of the output */
function stripNoise(text: string): string {
  return text
    .replace(/<system>[\s\S]*?<\/system>/g, '')
    .replace(/<tools-used-before-summary>[\s\S]*?<\/tools-used-before-summary>/g, '')
    .replace(/<\/?repl-output>/g, '');
}

/**
 * Splits a body into its <log>, <result> and <error> parts, in order. Text
 * outside those tags is kept as a 'text' section.
 */
export function parseSections(body: string): ResultSection[] {
  const text = stripNoise(body);
  const sections: ResultSection[] = [];
  const re = /<(result|error|log)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(last, m.index).trim();
    if (before) sections.push({ kind: 'text', text: before });
    sections.push({ kind: m[1] as ResultSection['kind'], text: m[2].replace(/^\n+|\s+$/g, '') });
    last = re.lastIndex;
  }
  const rest = text.slice(last).trim();
  if (rest) sections.push({ kind: 'text', text: rest });
  return sections;
}

/** `(dispatched #N)`: the script was queued, its output arrives via Poll */
export function dispatchedId(text: string): string | undefined {
  const m = /^\s*\(dispatched #(\d+)\)\s*$/.exec(stripNoise(text));
  return m ? m[1] : undefined;
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : undefined;
}

/**
 * Events of a Poll result. Only <event> tags carrying a nonce listed in the
 * result's <system> line are real; anything event-shaped without one is text
 * quoted inside an event body and stays part of that body.
 */
export function parsePollEvents(text: string): PollEvent[] | undefined {
  const header = /authentic event nonces for this delivery:\s*([^\s—<]+(?:\s*,\s*[^\s—<,]+)*)/.exec(text);
  const nonces = header ? header[1].split(/\s*,\s*/).filter(Boolean) : [];
  const startRe = /<event\b([^>]*)>/g;
  const starts: { index: number; end: number; attrs: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(text)) !== null) {
    const nonce = attr(m[1], 'nonce');
    // Older transcripts have no nonces at all: accept every event then
    if (nonces.length > 0 ? nonce !== undefined && nonces.includes(nonce) : nonce === undefined) {
      starts.push({ index: m.index, end: startRe.lastIndex, attrs: m[1] });
    }
  }
  if (starts.length === 0) return undefined;

  return starts.map((s, i) => {
    const stop = i + 1 < starts.length ? starts[i + 1].index : text.length;
    let body = text.slice(s.end, stop);
    const close = body.lastIndexOf('</event>');
    if (close !== -1) body = body.slice(0, close);
    return {
      kind: attr(s.attrs, 'kind') ?? 'event',
      evalId: attr(s.attrs, 'eval'),
      status: attr(s.attrs, 'status'),
      ms: attr(s.attrs, 'ms'),
      sections: parseSections(body),
    };
  });
}

/** First non-empty line, for a collapsed card's preview */
export function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim() !== '');
  return line ? line.trim() : '';
}
