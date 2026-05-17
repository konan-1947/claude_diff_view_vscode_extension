#!/usr/bin/env node
// AI CLI diff view PreToolUse hook
// Called BEFORE Write / Edit / MultiEdit executes.
// Snapshots the file so the VSCode extension can show a diff later.

const fs = require('fs');
const path = require('path');
const os = require('os');

const SNAPSHOT_DIR = path.join(os.tmpdir(), 'ai-cli-diff-snapshots');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const toolInput = event.tool_input || event.input;
    const filePath = toolInput && toolInput.file_path;

    if (!filePath) { process.exit(0); return; }

    const absPath = path.resolve(filePath);
    const safeName = absPath.replace(/[^a-zA-Z0-9]/g, '_');

    if (!fs.existsSync(SNAPSHOT_DIR)) {
      fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    }

    const fileExistedBefore = fs.existsSync(absPath);
    let content = '';
    try { content = fs.readFileSync(absPath, 'utf8'); } catch { /* new file */ }

    fs.writeFileSync(path.join(SNAPSHOT_DIR, safeName), content, 'utf8');
    fs.writeFileSync(
      path.join(SNAPSHOT_DIR, `${safeName}.json`),
      JSON.stringify({ fileExistedBefore, timestamp: Date.now() }),
      'utf8'
    );
  } catch (e) {
    // Never block Claude — always exit 0
  }
  process.exit(0);
});
