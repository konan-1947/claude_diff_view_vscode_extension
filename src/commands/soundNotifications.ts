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
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    fileExists = false;
  }

  if (!enabled && !fileExists) {
    return;
  }

  const hooks = { ...(settings['hooks'] as Record<string, unknown> | undefined ?? {}) };

  if (enabled) {
    hooks['Notification'] = soundHookEntry('C:\\Windows\\Media\\Alarm10.wav');
    hooks['Stop'] = soundHookEntry('C:\\Windows\\Media\\tada.wav');
  } else {
    delete hooks['Notification'];
    delete hooks['Stop'];
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
