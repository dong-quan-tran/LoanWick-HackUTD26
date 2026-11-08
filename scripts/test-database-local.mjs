import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let server, startupError, log;
async function freePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a loopback port');
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return address.port;
}
async function ready(port) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (server.exitCode !== null || server.signalCode) throw new Error('Temporary database server exited during startup');
    const connected = await new Promise(resolve => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(200);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
    if (connected) return;
    await delay(100);
  }
  throw new Error('Temporary database did not become ready');
}
async function run(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`Live database check failed (${code})`);
}
try {
  const configuredCli = process.env.LOANWICK_SPACETIME_CLI;
  if (!configuredCli || !existsSync(configuredCli)) throw new Error('Set LOANWICK_SPACETIME_CLI to the full path of CLI 2.14.0');
  const cli = resolve(configuredCli);
  const executable = process.env.LOANWICK_SPACETIME_SERVER ?? join(dirname(cli), 'spacetimedb-standalone' + (process.platform === 'win32' ? '.exe' : ''));
  if (!existsSync(executable)) throw new Error('Set LOANWICK_SPACETIME_SERVER to the standalone 2.14.0 executable');
  const temp = mkdtempSync(join(tmpdir(), 'loanwick-live-'));
  const data = join(temp, 'data'); mkdirSync(data);
  const privateKeyPath = join(temp, 'signing-private.pem'), publicKeyPath = join(temp, 'signing-public.pem');
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  writeFileSync(privateKeyPath, keys.privateKey, { mode: 0o600 }); writeFileSync(publicKeyPath, keys.publicKey);
  log = openSync(join(temp, 'server.log'), 'a');
  const port = await freePort();
  server = spawn(executable, ['start', '--listen-addr', `127.0.0.1:${port}`, '--in-memory', '--non-interactive', '--page_pool_max_size', '268435456',
    '--data-dir', data, '--jwt-priv-key-path', privateKeyPath, '--jwt-pub-key-path', publicKeyPath], { stdio: ['ignore', log, log], windowsHide: true });
  server.on('error', error => { startupError = error; });
  await ready(port);
  const env = { ...process.env, LOANWICK_SPACETIME_CLI: cli, LOANWICK_DB_URL: `http://127.0.0.1:${port}` };
  const moduleDir = join(root, 'spacetimedb');
  await run([join(moduleDir, 'node_modules/tsx/dist/cli.mjs'), 'scripts/local.ts', 'test'], moduleDir, env);
  await run([join(root, 'scripts/test-database.mjs')], root, env);
  console.log('Both live suites passed. Temporary server is stopping.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
} finally {
  if (server && !startupError && server.exitCode === null && !server.signalCode) {
    const stopped = once(server, 'exit'); server.kill();
    await Promise.race([stopped, delay(3000, undefined, { ref: false })]);
    if (server.exitCode === null && !server.signalCode) server.kill('SIGKILL');
  }
  if (log !== undefined) closeSync(log);
}
