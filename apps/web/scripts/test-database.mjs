import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const source = process.env.LOANWICK_WEB_DATABASE_SOURCE;
const cli = process.env.LOANWICK_SPACETIME_CLI;
let server, serverError, log, seedLog;
let secrets = [];
const redact = value => secrets.reduce((s, token) => s.replaceAll(token, '[redacted]'), value);
async function run(args, cwd, env, quiet = false) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const [code] = await once(child, 'exit');
  if (!quiet) process.stdout.write(redact(output));
  else if (seedLog !== undefined) writeFileSync(seedLog, output);
  if (code !== 0) throw new Error(quiet ? 'Disposable database provisioning failed; inspect the private local seed log.' : `Database browser check step failed (${code}).`);
}
async function freePort() {
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise((resolve, reject) => listener.close(e => e ? reject(e) : resolve())); return port;
}
async function ready(port) {
  const deadline = Date.now() + 10_000;
  do {
    if (serverError) throw serverError;
    if (server.exitCode !== null || server.signalCode) throw new Error('Temporary database exited during startup.');
    const connected = await new Promise(resolve => {
      const socket = createConnection({ host: '127.0.0.1', port }); socket.setTimeout(200);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
    if (connected) return; await delay(100);
  } while (Date.now() < deadline);
  throw new Error('Temporary database did not become ready.');
}
try {
  if (!source || !cli || !existsSync(cli)) throw new Error('Set LOANWICK_WEB_DATABASE_SOURCE and LOANWICK_SPACETIME_CLI as documented in docs/FRONTEND.md.');
  const backend = resolve(source), module = join(backend, 'spacetimedb');
  for (const path of ['scripts/local.ts', 'node_modules/tsx/dist/cli.mjs']) if (!existsSync(join(module, path))) throw new Error('Install the isolated backend dependencies first (npm ci and npm ci --prefix spacetimedb).');
  if (!existsSync(join(backend, 'packages/database-adapter/package.json'))) throw new Error('Use the source-backed Person 4 database test checkout.');
  const executable = process.env.LOANWICK_SPACETIME_SERVER ?? join(dirname(resolve(cli)), 'spacetimedb-standalone' + (process.platform === 'win32' ? '.exe' : ''));
  if (!existsSync(executable)) throw new Error('Standalone server 2.14.0 was not found beside the CLI.');
  console.log('Building the frontend contracts and the isolated published database bridge.');
  await run([join(root, 'node_modules/typescript/bin/tsc'), '-b', 'packages/contracts', 'packages/analysis'], root, process.env);
  await run([join(backend, 'node_modules/typescript/bin/tsc'), '-b', 'packages/contracts', 'packages/analysis', 'packages/database-adapter'], backend, process.env);
  const temp = mkdtempSync(join(tmpdir(), 'loanwick-web-database-')); mkdirSync(join(temp, 'data'));
  const privateKey = join(temp, 'private.pem'), publicKey = join(temp, 'public.pem');
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  writeFileSync(privateKey, keys.privateKey, { mode: 0o600 }); writeFileSync(publicKey, keys.publicKey);
  log = openSync(join(temp, 'server.log'), 'a', 0o600); seedLog = openSync(join(temp, 'seed.log'), 'a', 0o600);
  const port = await freePort();
  server = spawn(executable, ['start', '--listen-addr', `127.0.0.1:${port}`, '--in-memory', '--non-interactive', '--page_pool_max_size', '268435456',
    '--data-dir', join(temp, 'data'), '--jwt-priv-key-path', privateKey, '--jwt-pub-key-path', publicKey], { stdio: ['ignore', log, log], windowsHide: true });
  server.on('error', error => { serverError = error; }); await ready(port);
  const local = join(module, '.local');
  const folders = () => existsSync(local) ? readdirSync(local).filter(n => n.startsWith('loanwick-demo-')) : [];
  const before = new Set(folders());
  const env = { ...process.env, LOANWICK_SPACETIME_CLI: resolve(cli), LOANWICK_DB_URL: `http://127.0.0.1:${port}` };
  console.log('Provisioning a fresh loopback database with separate synthetic role sessions.');
  await run([join(module, 'node_modules/tsx/dist/cli.mjs'), 'scripts/local.ts', 'demo'], module, env, true);
  const created = folders().filter(n => !before.has(n)); if (created.length !== 1) throw new Error('Expected one new disposable database.');
  const sessionFile = join(local, created[0], 'sessions.json');
  secrets = JSON.parse(readFileSync(sessionFile, 'utf8')).sessions.map(s => s.token);
  console.log('Running real database browser coverage (deterministic test bridge; no model calls).');
  await run([join(root, 'node_modules/playwright/cli.js'), 'test', '--config', 'apps/web/playwright.database.config.ts'], root,
    { ...env, LOANWICK_WEB_DATABASE_SOURCE: backend, LOANWICK_WEB_DATABASE_SESSIONS: sessionFile });
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : 'Database browser check failed.')); process.exitCode = 1;
} finally {
  if (server && !serverError && server.exitCode === null && !server.signalCode) {
    const stopped = once(server, 'exit'); server.kill(); await Promise.race([stopped, delay(3000, undefined, { ref: false })]);
    if (server.exitCode === null && !server.signalCode) { server.kill('SIGKILL'); await stopped; }
  }
  if (log !== undefined) closeSync(log); if (seedLog !== undefined) closeSync(seedLog);
}
