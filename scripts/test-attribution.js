const assert = require('assert');
const os = require('os'), fs = require('fs'), path = require('path'), cp = require('child_process');
const A = require('../out/attribution/claudeAttribution');
const I = require('../out/attribution/claudeHookInstaller');
const S = require('../out/attribution/claudeHookSource');
let pass = 0; const ok = (c, m) => { assert(c, m); pass++; console.log('  ✓', m); };

const ev = (event, tool, id, input, at, sid='s1') => A.parseHookEvent(JSON.stringify({
  hook_event_name: event, tool_name: tool, tool_use_id: id, session_id: sid, cwd: '/ws', tool_input: input }), at);

console.log('Attribution logic');
{
  const a = new A.ClaudeAttribution();
  ok(!a.isClaudeWrite('/ws/copied.txt', 1000), 'file copied in with no hook events → NOT Claude (the reported bug)');
  a.ingest(ev('PreToolUse', 'Write', 't1', { file_path: '/ws/a.ts' }, 1000));
  ok(a.isClaudeWrite('/ws/a.ts', 1200), 'Write target during tool → Claude');
  ok(!a.isClaudeWrite('/ws/copied.txt', 1200), 'other file during a Write → NOT Claude');
  a.ingest(ev('PostToolUse', 'Write', 't1', { file_path: '/ws/a.ts' }, 1300));
  ok(a.isClaudeWrite('/ws/a.ts', 3000), 'watcher event arriving shortly after PostToolUse → Claude (grace)');
  ok(!a.isClaudeWrite('/ws/a.ts', 60000), 'later write by user to same file → NOT Claude');
  ok(!a.isClaudeWrite('/ws/a.ts', 500), 'write before PreToolUse → NOT Claude');
}
{
  const a = new A.ClaudeAttribution();
  a.ingest(ev('PreToolUse', 'Edit', 't2', { file_path: 'src/b.ts' }, 1000));
  ok(a.isClaudeWrite(path.resolve('/ws/src/b.ts'), 1100), 'relative file_path resolved against cwd');
}
{
  const a = new A.ClaudeAttribution();
  a.ingest(ev('PreToolUse', 'Bash', 'b1', { command: "sed -i 's/x/y/' f.ts" }, 1000));
  ok(a.isClaudeWrite('/ws/f.ts', 1500), 'write during Bash command → Claude');
  a.ingest(ev('PostToolUse', 'Bash', 'b1', { command: '...' }, 2000));
  ok(!a.isClaudeWrite('/ws/copied.txt', 20000), 'copy after Bash finished → NOT Claude');
}
{
  const a = new A.ClaudeAttribution(undefined, () => false);
  a.ingest(ev('PreToolUse', 'Bash', 'b1', { command: 'x' }, 1000));
  ok(!a.isClaudeWrite('/ws/f.ts', 1500), 'Bash attribution disabled → shell writes not attributed');
}
{
  const a = new A.ClaudeAttribution();
  a.ingest(ev('PreToolUse', 'Bash', 'b1', { command: 'x' }, 1000)); // denied: no Post
  a.ingest(A.parseHookEvent(JSON.stringify({ hook_event_name: 'Stop', session_id: 's1' }), 5000));
  ok(!a.isClaudeWrite('/ws/copied.txt', 30000), 'denied Bash (no Post) closed by Stop at end of turn');
}
{
  const a = new A.ClaudeAttribution();
  a.ingest(ev('PreToolUse', 'Read', 'r1', { file_path: '/ws/a.ts' }, 1000));
  ok(!a.isClaudeWrite('/ws/a.ts', 1100), 'Read tool never attributes');
  ok(A.parseHookEvent('\uFEFF{"hook_event_name":"Stop"}', 1) !== undefined, 'BOM-prefixed payload parses');
  ok(A.parseHookEvent('garbage', 1) === undefined, 'garbage payload ignored');
  ok(A.normalizeFsPath('C:\\Proj\\A.ts', 'win32') === A.normalizeFsPath('C:\\Proj\\A.ts', 'win32').toLowerCase(), 'win32 paths lowercased');
}

console.log('settings.json installer');
{
  const user = { model: 'opus', hooks: {
    PreToolUse: [{ matcher: '^Bash$', hooks: [{ type: 'command', command: 'my-guard.sh' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'notify-send done' }] }] } };
  const raw = JSON.stringify(user, null, 2);
  const r1 = I.computeHookSettings(raw, true, 'linux');
  const s1 = JSON.parse(r1.content);
  ok(r1.changed, 'install changes settings');
  ok(s1.model === 'opus' && s1.hooks.PreToolUse.length === 2 && s1.hooks.Stop.length === 2, 'user hooks + other settings preserved');
  ok(s1.hooks.PostToolUse[0].matcher === I.TOOL_MATCHER, 'PostToolUse registered with matcher');
  ok(!I.computeHookSettings(r1.content, true, 'linux').changed, 'second install is a no-op (no rewrite)');
  const r3 = JSON.parse(I.computeHookSettings(r1.content, false, 'linux').content);
  ok(JSON.stringify(r3) === JSON.stringify(user), 'uninstall restores exactly the original config');
  ok(I.computeHookSettings('{ broken', true, 'linux').parseError, 'malformed settings.json → refuse to write');
  {
    const r = I.computeHookSettings('{ broken', false, 'linux');
    ok(!r.parseError && !r.changed, 'feature off + unparseable file without our hook → silent no-op (startup case)');
  }
  ok(I.computeHookSettings('{ broken ' + 'ai-cli-diff-view/claude-events', false, 'linux').parseError,
    'feature off + unparseable file that contains our hook → refuse to write');
  {
    const withBom = '\uFEFF' + raw;
    const rb = I.computeHookSettings(withBom, true, 'linux');
    ok(!rb.parseError && rb.changed, 'UTF-8 BOM settings.json parses (Notepad/PowerShell)');
    ok(rb.content.startsWith('\uFEFF') && JSON.parse(rb.content.slice(1)).model === 'opus', 'BOM preserved, settings kept');
    const ru = I.computeHookSettings(rb.content, false, 'linux').content;
    ok(ru.startsWith('\uFEFF') && JSON.stringify(JSON.parse(ru.slice(1))) === JSON.stringify(user),
      'BOM file: uninstall restores original settings');
  }
  const w = JSON.parse(I.computeHookSettings('', true, 'win32').content);
  ok(w.hooks.PreToolUse[0].hooks[0].shell === 'powershell', 'Windows uses powershell hook');
}

(async () => {
  const isWin = process.platform === 'win32';
  const hasPwsh = (() => { try { cp.execSync('pwsh -NoProfile -c "exit 0"', { stdio: 'ignore' }); return true; } catch { return false; } })();
  const vnFile = isWin ? 'C:\\ws\\thư mục\\ghi chú.md' : '/ws/thư mục/ghi chú.md';
  const payload = { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_use_id: 'x1', session_id: 's',
    cwd: isWin ? 'C:\\ws' : '/ws', tool_input: { file_path: vnFile } };

  async function endToEnd(label, platform, shell, homeVar) {
    console.log(`End-to-end (${label}): real hook command → event files → source`);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'));
    const cmd = JSON.parse(I.computeHookSettings('', true, platform).content).hooks.PreToolUse[0].hooks[0].command;
    cp.execSync(cmd, { input: Buffer.from(JSON.stringify(payload), 'utf8'), env: { ...process.env, [homeVar]: home }, shell });
    const dir = path.join(home, '.ai-cli-diff-view', 'claude-events');
    const files = fs.readdirSync(dir);
    ok(files.length === 1 && files[0].endsWith('.json'), `${label}: hook wrote exactly one .json event file (no leftover .tmp)`);
    ok(JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8')).tool_input.file_path === vnFile,
      `${label}: Vietnamese path stored byte-exact`);
    const src = new S.ClaudeHookSource(new A.ClaudeAttribution(), dir);
    ok(await src.isClaudeWrite(vnFile, Date.now()), `${label}: non-ASCII path attributed`);
    ok(!(await src.isClaudeWrite(isWin ? 'C:\\ws\\copied.txt' : '/ws/copied.txt', Date.now())), `${label}: copied file not attributed`);
    ok(src.hasSeenAnyEvent(), `${label}: source reports hook is alive`);
  }

  if (isWin) {
    await endToEnd('Windows PowerShell', 'win32', 'powershell.exe', 'USERPROFILE');
  } else {
    await endToEnd('sh', 'linux', '/bin/sh', 'HOME');
    if (hasPwsh) { await endToEnd('pwsh', 'win32', 'pwsh', 'USERPROFILE'); }
  }
  console.log(`\n${pass} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
