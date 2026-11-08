import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Identity } from 'spacetimedb'
import { DbConnection } from '../bindings'

const moduleDir = fileURLToPath(new URL('..', import.meta.url))
const cli = process.env.LOANWICK_SPACETIME_CLI ?? 'spacetime'
const version = '2.14.0'
const organizationId = 'demo-org'

type LocalIdentity = { identity: string; token: string }

function verifyCli() {
  const result = spawnSync(cli, ['--version'], { encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout.includes(`spacetimedb tool version ${version};`)) {
    throw new Error(`Use SpacetimeDB CLI ${version}. Set LOANWICK_SPACETIME_CLI if it is outside PATH.`)
  }
}

function run(executable: string, args: string[], env = process.env) {
  const result = spawnSync(executable, args, { cwd: moduleDir, env, stdio: 'inherit' })
  if (result.error) throw new Error(result.error.message)
  if (result.status !== 0) throw new Error(`${executable} exited with ${result.status ?? result.signal}`)
}

async function newIdentity(endpoint: string): Promise<LocalIdentity> {
  const response = await fetch(`${endpoint}/v1/identity`, { method: 'POST', signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`Local identity creation returned HTTP ${response.status}`)
  const result = await response.json() as Partial<LocalIdentity>
  if (typeof result.identity !== 'string' || typeof result.token !== 'string') throw new Error('Local identity response was incomplete')
  return { identity: result.identity, token: result.token }
}

function connect(endpoint: string, database: string, token: string, views: string[] = []) {
  return new Promise<DbConnection>((resolve, reject) => {
    let connection: DbConnection
    const timeout = setTimeout(() => {
      connection?.disconnect()
      reject(new Error('Timed out connecting to the local database'))
    }, 5000)
    const fail = (error: Error) => {
      clearTimeout(timeout)
      connection?.disconnect()
      reject(error)
    }
    const done = (client: DbConnection) => {
      clearTimeout(timeout)
      resolve(client)
    }
    connection = DbConnection.builder().withUri(endpoint).withDatabaseName(database).withToken(token)
      .onConnect(client => {
        if (views.length === 0) done(client)
        else client.subscriptionBuilder().onApplied(() => done(client))
          .onError(ctx => fail(ctx.event ?? new Error('Local subscription rejected')))
          .subscribe(views.map(view => `SELECT * FROM ${view}`))
      }).onConnectError((_ctx, error) => fail(error)).build()
  })
}

async function seed(endpoint: string, database: string, root: string, owner: LocalIdentity) {
  const roles = [
    ['officer', 'officer'], ['reviewer', 'reviewer'], ['worker', 'worker'],
    ['borrower-a', 'borrower'], ['borrower-b', 'borrower'],
  ] as const
  const sessions = await Promise.all(roles.map(async ([id, role]) => ({ id, role, ...await newIdentity(endpoint) })))
  const admin = await connect(endpoint, database, owner.token)
  try {
    for (const session of sessions) {
      await admin.reducers.assignDemoUser({
        identity: Identity.fromString(session.identity), id: session.id, role: session.role,
        organizationId, displayName: session.id, active: true,
      })
    }
    await admin.reducers.seedDemo({ organizationId, borrowerAId: 'borrower-a', borrowerBId: 'borrower-b' })
  } finally {
    admin.disconnect()
  }
  const officer = await connect(endpoint, database, sessions[0].token, ['staff_applications'])
  try {
    if ([...officer.db.staffApplications.iter()].length !== 8) throw new Error('Officer subscription did not see all eight demo cases')
  } finally {
    officer.disconnect()
  }
  const sessionFile = join(root, 'sessions.json')
  await writeFile(sessionFile, JSON.stringify({ endpoint, database, sessions }, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  console.log(`Seeded eight synthetic cases in ${database}. Local role sessions are in ${sessionFile}`)
}

async function main() {
  const mode = process.argv[2]
  if (mode !== 'demo' && mode !== 'test') throw new Error('Use npm run demo:local or npm run test:local')
  const url = new URL(process.env.LOANWICK_DB_URL ?? 'http://127.0.0.1:4310')
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('LOANWICK_DB_URL must be a loopback HTTP origin')
  }
  verifyCli()
  const endpoint = url.origin
  const database = `loanwick-${mode}-${randomBytes(6).toString('hex')}`
  const root = join(moduleDir, '.local', database)
  await mkdir(root, { recursive: true })
  const owner = await newIdentity(endpoint)
  run(cli, ['--root-dir', root, 'login', '--token', owner.token])
  run(cli, ['--root-dir', root, 'publish', database, '--server', endpoint, '--module-path', moduleDir, '--yes=skip-login'])
  if (mode === 'demo') await seed(endpoint, database, root, owner)
  else run(process.execPath, ['--import', 'tsx', '--test', 'tests/integration.test.ts'], {
    ...process.env, LOANWICK_DB_NAME: database, LOANWICK_DB_URL: endpoint, LOANWICK_ADMIN_TOKEN: owner.token,
  })
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
