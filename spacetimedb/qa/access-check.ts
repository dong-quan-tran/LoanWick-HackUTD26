// Access check for ONE identity: role, what it can see, and that private tables stay blocked.
// Usage: tsx access-check.ts <endpoint> <database> <tokenFile>
// Prints one JSON line. Never prints the token. Read-only: subscribes only, calls no reducers.
import { readFileSync } from 'node:fs'
import { DbConnection } from '../bindings'

const [endpoint, database, tokenFile] = process.argv.slice(2)
if (!endpoint || !database || !tokenFile) throw new Error('usage: access-check.ts <endpoint> <database> <tokenFile>')
const ROLE_VIEWS: Record<string, string[]> = {
  officer: ['staff_applications', 'staff_jobs', 'staff_readiness'],
  reviewer: ['staff_applications', 'staff_jobs', 'staff_readiness'],
  borrower: ['borrower_applications', 'borrower_clarifications'],
  worker: ['worker_available_jobs', 'worker_job_outcomes'],
}
const OTHER_VIEWS = ['staff_applications', 'borrower_applications', 'worker_available_jobs']
const fail = (message: string) => { console.log(JSON.stringify({ ok: false, error: message })); process.exit(1) }
const timer = setTimeout(() => fail('timed out connecting'), 20_000)

DbConnection.builder().withUri(endpoint).withDatabaseName(database).withToken(readFileSync(tokenFile, 'utf8').trim())
  .onConnect((client, identity) => {
    const done = (result: object) => { clearTimeout(timer); console.log(JSON.stringify(result)); client.disconnect(); setTimeout(() => process.exit(0), 100) }
    client.subscriptionBuilder().onApplied(() => {
      const me = [...client.db.myUser.iter()][0]
      if (!me) return done({ ok: true, identity: identity.toHexString(), role: null, note: 'not registered yet' })
      const views = [...new Set([...(ROLE_VIEWS[me.role] ?? []), ...OTHER_VIEWS])]
      client.subscriptionBuilder().onApplied(() => {
        const staff = [...client.db.staffApplications.iter()]
        const own = [...client.db.borrowerApplications.iter()]
        const jobs = [...client.db.workerAvailableJobs.iter()]
        client.subscriptionBuilder()
          .onApplied(() => done({ ok: false, error: 'private table was readable' }))
          .onError(() => done({
            ok: true, identity: identity.toHexString(), user: me.id, role: me.role, organization: me.organizationId,
            staffCasesVisible: staff.length, ownBorrowerCases: own.map(a => a.id).sort(), workerJobsVisible: jobs.length,
            privateTablesBlocked: true,
          }))
          .subscribe('SELECT * FROM applications')
      }).onError(() => fail('role view subscription failed')).subscribe(views.map(v => `SELECT * FROM ${v}`))
    }).onError(() => fail('my_user subscription failed')).subscribe('SELECT * FROM my_user')
  })
  .onConnectError((_ctx, error) => fail(`could not connect: ${String(error)}`))
  .build()
