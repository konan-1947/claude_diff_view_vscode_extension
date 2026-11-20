/**
 * Line patch for Edit/MultiEdit previews. The CLI gives only old_string/new_string,
 * so lines shared at the start and end are kept as context (' ' prefix) and only
 * the middle is shown as removed/added — the way Cursor's inline diff reads.
 */
export interface LinePatch {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

const CONTEXT = 1;

export function generateLinePatch(oldStr: string, newStr: string): LinePatch[] {
  const a = oldStr.split('\n');
  const b = newStr.split('\n');

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

  const ctxHead = Math.min(head, CONTEXT);
  const ctxTail = Math.min(tail, CONTEXT);

  const lines: string[] = [];
  for (let i = head - ctxHead; i < head; i++) lines.push(' ' + a[i]);
  for (let i = head; i < a.length - tail; i++) lines.push('-' + a[i]);
  for (let i = head; i < b.length - tail; i++) lines.push('+' + b[i]);
  for (let i = a.length - tail; i < a.length - tail + ctxTail; i++) lines.push(' ' + a[i]);

  return [
    {
      oldStart: head - ctxHead + 1,
      oldLines: a.length - head - tail + ctxHead + ctxTail,
      newStart: head - ctxHead + 1,
      newLines: b.length - head - tail + ctxHead + ctxTail,
      lines,
    },
  ];
}
