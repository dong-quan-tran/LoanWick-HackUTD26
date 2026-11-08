import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const moduleDir = resolve(root, 'spacetimedb');
const local = resolve(moduleDir, '.local');
const folders = () => { try { return readdirSync(local).filter(name => name.startsWith('loanwick-demo-')); } catch (e) { if (e.code === 'ENOENT') return []; throw e; } };
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: moduleDir, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Database test step failed (${result.status})`);
}
try {
  run([resolve(moduleDir, 'node_modules/typescript/bin/tsc'), '-p', resolve(root, 'integration/database/tsconfig.json')]);
  const before = new Set(folders());
  run([resolve(moduleDir, 'node_modules/tsx/dist/cli.mjs'), 'scripts/local.ts', 'demo']);
  const created = folders().filter(name => !before.has(name));
  if (created.length !== 1) throw new Error('Expected one fresh local demo database');
  const sessions = resolve(local, created[0], 'sessions.json');
  run(['--import', 'tsx', '--test', resolve(root, 'integration/database/analysis.test.ts')], { ...process.env, LOANWICK_BRIDGE_SESSIONS: sessions });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
}
