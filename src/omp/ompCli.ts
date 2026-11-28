import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/** `ai-cli-diff-view.ompCliPath`, else `omp` on PATH, else well-known install dirs. */
export function findOmpCli(): string {
  const configured = vscode.workspace.getConfiguration('ai-cli-diff-view').get<string>('ompCliPath')?.trim();
  if (configured) return configured;
  const exe = process.platform === 'win32' ? ['omp.exe', 'omp.cmd', 'omp'] : ['omp'];
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  dirs.push(path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.bun', 'bin'), '/usr/local/bin', '/opt/homebrew/bin');
  for (const dir of dirs) {
    for (const name of exe) {
      const candidate = path.join(dir, name);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch { /* not here */ }
    }
  }
  return 'omp';
}
