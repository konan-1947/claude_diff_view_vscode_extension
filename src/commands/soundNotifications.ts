import * as fs from 'fs';
import * as path from 'path';

/**
 * soundNotifications.ts
 *
 * Bật/tắt âm thanh thông báo (Claude vừa xong lượt / cần input) qua hook
 * `Notification`/`Stop` trong `~/.claude/settings.json`. Đây là tính năng độc
 * lập với diff detection — extension không còn tự cài `PreToolUse`/
 * `PostToolUse` nữa (xem CLAUDE.md), nên chỉ động vào đúng 2 key này, giữ
 * nguyên mọi hook khác user đã có sẵn.
 */

function getClaudeSettingsPath(): string {
  const home = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
  return path.join(home, '.claude', 'settings.json');
}

function soundHookEntry(wavPath: string): unknown {
  return [
    {
      hooks: [
        {
          type: 'command',
          shell: 'powershell',
          command: `(New-Object System.Media.SoundPlayer '${wavPath}').PlaySync()`,
          async: true,
        },
      ],
    },
  ];
}

/**
 * Ghi/xoá hook Notification+Stop trong `~/.claude/settings.json` theo giá trị
 * `enabled`. Chỉ hỗ trợ Windows (dùng `System.Media.SoundPlayer` qua
 * PowerShell) — no-op trên platform khác.
 */
export function applySoundNotifications(enabled: boolean): void {
  if (process.platform !== 'win32') {
    return;
  }

  const settingsPath = getClaudeSettingsPath();
  const settingsDir = path.dirname(settingsPath);

  let settings: Record<string, unknown> = {};
  let fileExists = true;
  let raw: string | undefined;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch {
    fileExists = false;
  }
  if (raw !== undefined && raw.trim()) {
    try {
      settings = JSON.parse(raw);
    } catch {
      return; // malformed user config — never overwrite it with {}
    }
  }

  if (!enabled && !fileExists) {
    return;
  }

  const hooks = { ...(settings['hooks'] as Record<string, unknown> | undefined ?? {}) };
  const before = JSON.stringify(settings['hooks'] ?? {});

  // Only add/remove OUR entries (identified by SoundPlayer in the command).
  // Replacing the whole key used to wipe any other Notification/Stop hooks the
  // user had configured.
  const setOurs = (key: string, wavPath: string) => {
    const list = Array.isArray(hooks[key]) ? (hooks[key] as Array<{ hooks?: Array<{ command?: unknown }> }>) : [];
    const others = list.filter(g => !(g.hooks ?? []).some(
      h => typeof h.command === 'string' && h.command.includes('System.Media.SoundPlayer')
    ));
    const next = enabled ? [...others, ...(soundHookEntry(wavPath) as unknown[])] : others;
    if (next.length > 0) { hooks[key] = next; } else { delete hooks[key]; }
  };
  setOurs('Notification', 'C:\\Windows\\Media\\Alarm10.wav');
  setOurs('Stop', 'C:\\Windows\\Media\\tada.wav');

  if (JSON.stringify(hooks) === before) {
    return; // no semantic change → don't touch settings.json
  }

  settings['hooks'] = hooks;

  if (!fs.existsSync(settingsDir)) {
    if (!enabled) {
      return;
    }
    fs.mkdirSync(settingsDir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}
