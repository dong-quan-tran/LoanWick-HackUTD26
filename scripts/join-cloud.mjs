#!/usr/bin/env node
// One-command onboarding to the shared LoanWick SpacetimeDB database.
//   npm run join:cloud -- --name jason --roles officer,reviewer,borrower
// First run: installs the database client, creates one identity per role, saves each token in
// ~/.loanwick/<database>/<name>/<role>.token (outside the repository), and prints a message with PUBLIC identities only.
// Later runs: reuse the same tokens and report each role's access (what data is visible, private tables blocked).
// Options: --copy-token <role> copies that role's token to the clipboard for the web app (never printed).
//          --endpoint, --database, --token-dir override the shared defaults (used for local testing).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const ROLES = ['officer', 'reviewer', 'borrower', 'worker']
const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const moduleDir = join(repo, 'spacetimedb')
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => {
  if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true'])
  return pairs
}, []))
const endpoint = args.endpoint ?? 'https://maincloud.spacetimedb.com'
const database = args.database ?? 'loanwick-hackutd26-dev'
const say = (...lines) => console.log(lines.join('\n'))
const die = message => { console.error(`\n✖ ${message}`); process.exit(1) }

if (Number(process.versions.node.split('.')[0]) < 22) die(`Node.js 22.12+ is required (found ${process.version}). Install Node 24 from nodejs.org.`)

async function ask(question) {
  if (!process.stdin.isTTY) return ''
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try { return (await rl.question(question)).trim() } finally { rl.close() }
}

let name = (args.name ?? '').toLowerCase()
if (!name) name = (await ask('Your first name (letters only, e.g. jason): ')).toLowerCase()
name = name.replace(/[^a-z0-9-]/g, '').slice(0, 40)
if (!name) die('Pass --name <your-first-name>.')
let roles = (args.roles ?? '').toLowerCase()
if (!roles) roles = (await ask(`Roles you need, comma-separated (${ROLES.join(', ')}): `)).toLowerCase()
roles = [...new Set(roles.split(',').map(r => r.trim()).filter(Boolean))]
const bad = roles.filter(r => !ROLES.includes(r))
if (!roles.length || bad.length) die(`Roles must be from: ${ROLES.join(', ')}${bad.length ? ` (not: ${bad.join(', ')})` : ''}.`)
// One private folder per person, so several people (or the owner's demo identities) never share token files.
const tokenDir = args['token-dir'] ?? join(homedir(), '.loanwick', database, name)

// 1. Database client dependencies (spacetimedb/ only; quick, pinned by its lockfile).
if (!existsSync(join(moduleDir, 'node_modules', 'spacetimedb', 'package.json')) || !existsSync(join(moduleDir, 'node_modules', 'tsx'))) {
  say('Installing the database client (one time)…')
  const npmArgs = ['ci', '--prefix', 'spacetimedb', '--no-audit', '--no-fund']
  // `npm run` provides npm's own CLI path, so npm runs through Node directly (no shell, no argument concatenation).
  const npm = process.env.npm_execpath?.endsWith('.js')
    ? spawnSync(process.execPath, [process.env.npm_execpath, ...npmArgs], { cwd: repo, stdio: 'inherit' })
    : process.platform === 'win32'
      ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npm ${npmArgs.join(' ')}`], { cwd: repo, stdio: 'inherit' })
      : spawnSync('npm', npmArgs, { cwd: repo, stdio: 'inherit' })
  if (npm.status !== 0) die('npm ci --prefix spacetimedb failed. Check your internet connection and Node version.')
}
const tsx = join(moduleDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const runTs = (script, tokenFile) => {
  const out = spawnSync(process.execPath, [tsx, join(moduleDir, 'qa', script), endpoint, database, tokenFile],
    { cwd: moduleDir, encoding: 'utf8', timeout: 60_000 })
  const line = (out.stdout ?? '').trim().split('\n').reverse().find(l => l.startsWith('{'))
  if (!line) die(`${script} failed: ${(out.stderr ?? '').trim().split('\n').slice(-3).join(' ')}`)
  return JSON.parse(line)
}

// 2. One identity per role; tokens stay in the private folder.
mkdirSync(tokenDir, { recursive: true, mode: 0o700 })
const results = roles.map(role => {
  const tokenFile = join(tokenDir, `${role}.token`)
  const created = !existsSync(tokenFile)
  if (created) runTs('whoami.ts', tokenFile)
  return { requested: role, tokenFile, created, check: runTs('access-check.ts', tokenFile) }
})

// 3. Optional: copy one token to the clipboard for the web app's token field.
if (args['copy-token']) {
  const role = args['copy-token']
  const file = join(tokenDir, `${role}.token`)
  if (!existsSync(file)) die(`No ${role} identity yet. Include it in --roles first.`)
  const tool = process.platform === 'win32' ? ['clip'] : process.platform === 'darwin' ? ['pbcopy'] : ['xclip', '-selection', 'clipboard']
  const copied = spawnSync(tool[0], tool.slice(1), { input: readFileSync(file, 'utf8').trim() })
  say(copied.status === 0 ? `\n✔ ${role} token copied to the clipboard. Paste it into the web app, then copy something else.` :
    `\n✖ Could not use the clipboard (${tool[0]}). Open ${file} yourself; never paste it anywhere except the web app.`)
}

// 4. Web app connection settings (public values only) if this person uses the frontend.
const envLive = join(repo, 'apps', 'web', '.env.live')
if (roles.some(r => r !== 'worker') && existsSync(join(repo, 'apps', 'web')) && !existsSync(envLive) && !args.endpoint) {
  writeFileSync(envLive, `VITE_SPACETIMEDB_URI=${endpoint}\nVITE_SPACETIMEDB_DATABASE=${database}\n`)
  say(`\n✔ Wrote apps/web/.env.live (public endpoint and database name only; git-ignored).`)
}

// 5. Report.
say('', `LoanWick cloud access for "${name}" on ${database}`, '')
for (const { requested, check: c } of results) {
  const line = !c.ok ? `error: ${c.error}`
    : !c.user ? 'waiting for the owner to assign this role'
    : c.role !== requested ? `MISMATCH: this identity is registered as ${c.role}, not ${requested}. Tell the owner.`
    : `ASSIGNED as ${c.user} (${c.role}@${c.organization})`
  say(`  ${requested.padEnd(9)} ${line}`)
  if (c.ok && c.user) {
    const access = c.role === 'borrower' ? `own cases: ${c.ownBorrowerCases.length ? c.ownBorrowerCases.join(', ') : 'none yet'}`
      : c.role === 'worker' ? `jobs visible: ${c.workerJobsVisible}`
      : `cases visible: ${c.staffCasesVisible}`
    say(`            ${access}; private tables blocked: ${c.privateTablesBlocked ? 'yes' : 'NO'}`)
  }
}
const pending = results.filter(r => r.check.ok && !r.check.user)
if (results.some(r => !r.check.ok)) process.exitCode = 1
if (pending.length) {
  say('', '──── Send the lines below to the owner (they contain NO secrets) ────')
  for (const r of pending) say(`LOANWICK-JOIN db=${database} name=${name} role=${r.requested} user=${r.requested}-${name} id=${r.check.identity}`)
  say('────────────────────────────────────────────────────────────────────', '',
    `Your tokens are private files in ${tokenDir}. Never send them. Run this command again after the owner confirms.`)
} else {
  say('', 'All requested roles are active.')
  if (roles.some(r => r !== 'worker')) say('Web app: npm run dev:web:live, open http://127.0.0.1:5174, then rerun with --copy-token <role> and paste.')
  if (roles.includes('worker')) say(`Worker: LOANWICK_DB_URI=${endpoint}  LOANWICK_DB_NAME=${database}  LOANWICK_WORKER_TOKEN_FILE=${join(tokenDir, 'worker.token')}`)
}
