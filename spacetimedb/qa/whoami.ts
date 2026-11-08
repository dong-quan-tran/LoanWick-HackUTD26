// Identity helper: each teammate runs this ONCE against a LoanWick database, then again to confirm the assigned role.
// Usage: npx tsx spacetimedb/qa/whoami.ts <endpoint> <database> <tokenFile outside the repo>
// - First run: connects WITHOUT a token, the server mints a new identity; the token is saved to <tokenFile> (0600) and never printed.
// - Prints only the PUBLIC identity hex, which the owner uses to assign a role.
// - Later runs: reconnects with the saved token and prints my_user (role) to confirm the assignment.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { DbConnection } from '../bindings'

const [endpoint, database, tokenFile] = process.argv.slice(2)
if (!endpoint || !database || !tokenFile) throw new Error('usage: whoami.ts <endpoint> <database> <tokenFile>')
const saved = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : undefined
const builder = DbConnection.builder().withUri(endpoint).withDatabaseName(database)
if (saved) builder.withToken(saved)
const timer = setTimeout(() => { console.error('timeout'); process.exit(1) }, 10_000)
builder.onConnect((client, identity, token) => {
  if (!saved) writeFileSync(tokenFile, token, { mode: 0o600, flag: 'wx' })
  client.subscriptionBuilder().onApplied(() => {
    const me = [...client.db.myUser.iter()][0]
    console.log(JSON.stringify({ identity: identity.toHexString(), tokenSaved: !saved, myUser: me ?? null }))
    clearTimeout(timer); client.disconnect(); setTimeout(() => process.exit(0), 100)
  }).onError(() => { console.error('subscription rejected'); process.exit(1) }).subscribe(['SELECT * FROM my_user'])
}).onConnectError((_c, e) => { console.error(String(e)); process.exit(1) }).build()
