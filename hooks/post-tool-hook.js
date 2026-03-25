#!/usr/bin/env node
// Claude CLI PostToolUse hook
// Called AFTER Write / Edit / MultiEdit completes.
// Writes a signal file for the VSCode extension to pick up and open a diff.

const fs = require('fs');
const path = require('path');
const os = require('os');

const SNAPSHOT_DIR = path.join(os.tmpdir(), 'claude-diff-snapshots');
const SIGNAL_DIR   = path.join(os.tmpdir(), 'claude-diff-signals');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const toolInput = event.tool_input || event.input;
    const filePath = toolInput && toolInput.file_path;
    
    // Debug log for Claude integration
    const logPath = path.join(os.tmpdir(), "claude-diff-hook-debug.log");
    fs.appendFileSync(logPath, `[POST] Raw event: ${raw}\n`, 'utf8');

    if (!filePath) { process.exit(0); return; }

    const absPath = path.resolve(filePath);
    const safeName = absPath.replace(/[^a-zA-Z0-9]/g, '_');
    const snapshotPath = path.join(SNAPSHOT_DIR, safeName);

    if (!fs.existsSync(SIGNAL_DIR)) {
      fs.mkdirSync(SIGNAL_DIR, { recursive: true });
    }

    const signal = {
      filePath: absPath,
      snapshotPath,
      toolName: event.tool_name || 'Edit',
      timestamp: Date.now(),
    };

    // Unique filename to avoid collisions when multiple files change at once
    const signalFile = path.join(
      SIGNAL_DIR,
      `${Date.now()}-${safeName.slice(-30)}.json`
    );
    fs.writeFileSync(signalFile, JSON.stringify(signal), 'utf8');
  } catch (e) {
    // Never block Claude — always exit 0
  }
  process.exit(0);
});
