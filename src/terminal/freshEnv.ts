import { execFileSync } from 'child_process';

const SYSTEM_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';
const USER_KEY = 'HKCU\\Environment';
const CACHE_MS = 1000;

let cache: { at: number; env: Record<string, string> } | undefined;

/**
 * Environment for a new shell. `process.env` is a snapshot taken when VS Code started, so on Windows
 * variables changed since (setx, installers, System Properties) would be missing; re-read them from
 * the registry. Falls back to `process.env` if the registry cannot be read.
 */
export function getFreshEnv(): Record<string, string> {
  if (process.platform !== 'win32') {
    return { ...process.env } as Record<string, string>;
  }
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return { ...cache.env };
  }
  let env: Record<string, string>;
  try {
    env = mergeRegistryEnv();
  } catch {
    env = { ...process.env } as Record<string, string>;
  }
  cache = { at: now, env };
  return { ...env };
}

interface RegValue {
  name: string;
  value: string;
  expand: boolean;
}

function queryRegistry(key: string): RegValue[] {
  const out = execFileSync('reg', ['query', key], { encoding: 'utf8', timeout: 2000, windowsHide: true });
  const values: RegValue[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^\s+(\S.*?)\s+(REG_SZ|REG_EXPAND_SZ)(?:\s+(.*))?$/.exec(line);
    if (m) {
      values.push({ name: m[1], value: (m[3] ?? '').trim(), expand: m[2] === 'REG_EXPAND_SZ' });
    }
  }
  return values;
}

function mergeRegistryEnv(): Record<string, string> {
  const system = queryRegistry(SYSTEM_KEY);
  const user = queryRegistry(USER_KEY);

  const env: Record<string, string> = {};
  const keyOf = new Map<string, string>(); // lowercase name -> name as stored in env
  const set = (name: string, value: string): void => {
    const existing = keyOf.get(name.toLowerCase());
    env[existing ?? name] = value;
    if (!existing) {
      keyOf.set(name.toLowerCase(), name);
    }
  };
  const get = (name: string): string | undefined => {
    const existing = keyOf.get(name.toLowerCase());
    return existing === undefined ? undefined : env[existing];
  };
  const expand = (value: string): string => {
    let result = value;
    for (let i = 0; i < 5 && result.includes('%'); i++) {
      const next = result.replace(/%([^%]+)%/g, (whole, name: string) => get(name) ?? whole);
      if (next === result) {
        break;
      }
      result = next;
    }
    return result;
  };

  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      set(name, value);
    }
  }

  const pathEntries = (value: string): string[] => value.split(';').map((p) => p.trim()).filter(Boolean);
  const registryPath: string[] = [];
  // System first so user values win; PATH is handled separately below.
  for (const entry of [...system, ...user]) {
    const value = entry.expand ? expand(entry.value) : entry.value;
    if (entry.name.toLowerCase() === 'path') {
      registryPath.push(...pathEntries(value));
    } else {
      set(entry.name, value);
    }
  }

  // Registry PATH first, then anything the host added that the registry does not have.
  const seen = new Set<string>();
  const merged: string[] = [];
  const norm = (p: string): string => p.replace(/[\\/]+$/, '').toLowerCase();
  for (const p of [...registryPath, ...pathEntries(get('Path') ?? '')]) {
    const k = norm(p);
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(p);
    }
  }
  if (merged.length > 0) {
    set('Path', merged.join(';'));
  }
  return env;
}
