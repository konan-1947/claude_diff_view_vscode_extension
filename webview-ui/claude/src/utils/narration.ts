/**
 * "Narration" thinking blocks: the server tags some thinking blocks, by the
 * `block_kind` inside their signature, as its summary of the prose the model
 * wrote between tool calls. They are words to the user, not reasoning: the CLI
 * prints them as an answer (with a faint "· summary"), so they must not be
 * folded into a "Thought" row, or a turn whose only answer is one shows none.
 *
 * Live frames list them in `narration_block_indexes` (wrapper level, newer
 * CLIs); the transcript .jsonl does not keep that field, so a resumed session
 * is classified from the signature, as the CLI itself does: base64 → protobuf
 * field 2 → field 1 → field 8 (string) === "narration". Fail-closed: anything
 * unreadable is ordinary thinking.
 */

const NARRATION = 'narration';

function readVarint(buf: Uint8Array, pos: number): [number, number] | undefined {
  let value = 0;
  let mul = 1;
  for (let i = 0; i < 10; i++) {
    if (pos >= buf.length) return undefined;
    const b = buf[pos++];
    value += (b & 0x7f) * mul;
    if ((b & 0x80) === 0) return [value, pos];
    mul *= 128;
  }
  return undefined;
}

/** Bytes of the first length-delimited field `field` of a protobuf message */
function lengthField(buf: Uint8Array, field: number): Uint8Array | undefined {
  let pos = 0;
  while (pos < buf.length) {
    const key = readVarint(buf, pos);
    if (!key) return undefined;
    pos = key[1];
    const num = Math.floor(key[0] / 8);
    const wire = key[0] % 8;
    if (wire === 0) {
      const v = readVarint(buf, pos);
      if (!v) return undefined;
      pos = v[1];
    } else if (wire === 1) {
      pos += 8;
    } else if (wire === 5) {
      pos += 4;
    } else if (wire === 2) {
      const len = readVarint(buf, pos);
      if (!len) return undefined;
      const start = len[1];
      const end = start + len[0];
      if (end > buf.length) return undefined;
      if (num === field) return buf.subarray(start, end);
      pos = end;
    } else {
      return undefined;
    }
  }
  return undefined;
}

const cache = new Map<string, boolean>();

export function isNarrationSignature(signature: unknown): boolean {
  if (typeof signature !== 'string' || signature.length === 0) return false;
  const hit = cache.get(signature);
  if (hit !== undefined) return hit;
  let result = false;
  try {
    const bin = atob(signature);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const outer = lengthField(bytes, 2);
    const inner = outer && lengthField(outer, 1);
    const kind = inner && lengthField(inner, 8);
    result = !!kind && kind.length === NARRATION.length && String.fromCharCode(...kind) === NARRATION;
  } catch {
    result = false;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(signature, result);
  return result;
}

/**
 * A thinking block shown as answer text: listed in the frame's
 * `narration_block_indexes` or tagged so by its signature. One with no text
 * (thinking display "omitted") stays ordinary thinking, as the CLI says.
 */
export function isNarrationBlock(raw: any, listed: boolean): boolean {
  if (!raw || raw.type !== 'thinking') return false;
  if (typeof raw.thinking !== 'string' || raw.thinking.trim().length === 0) return false;
  return listed || isNarrationSignature(raw.signature);
}
