import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs'
import { request } from 'node:https'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { TestContext } from 'node:test'
import { createUploadServer } from '../transport/upload'

function opensslCommand() {
  if (process.env.LOANWICK_OPENSSL) return process.env.LOANWICK_OPENSSL
  if (process.platform === 'win32') {
    const gitPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()
    const bundled = resolve(gitPath, '../../../usr/bin/openssl.exe')
    if (existsSync(bundled)) return bundled
  }
  return 'openssl'
}

export async function startUploadTestServer(
  test: TestContext, worker: Parameters<typeof createUploadServer>[1], store: Parameters<typeof createUploadServer>[2],
) {
  const directory = mkdtempSync(join(tmpdir(), 'loanwick-upload-tls-'))
  const keyPath = join(directory, 'local.key')
  const certPath = join(directory, 'local.crt')
  test.after(() => {
    for (const file of [keyPath, certPath]) if (existsSync(file)) unlinkSync(file)
    rmdirSync(directory)
  })
  execFileSync(opensslCommand(), ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', keyPath, '-out', certPath],
  { stdio: 'ignore' })
  const cert = readFileSync(certPath)
  const server = createUploadServer({ key: readFileSync(keyPath), cert, allowedOrigin: 'https://loanwick.test' }, worker, store)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  test.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('HTTPS test server has no port')

  return function send(headers: Record<string, string | number>, bytes: Buffer, method: 'POST' | 'OPTIONS' = 'POST') {
    return new Promise<{ status: number | undefined; continued: boolean; body: string; allowedOrigin?: string }>((resolve, reject) => {
      let continued = false
      const bodyHeaders = method === 'POST' ? { expect: '100-continue', 'content-length': bytes.length } : {}
      const upload = request({ host: '127.0.0.1', port: address.port, ca: cert, path: '/documents/upload',
        method, headers: { ...bodyHeaders, ...headers } }, response => {
        let body = ''
        response.setEncoding('utf8').on('data', chunk => { body += chunk })
        response.on('end', () => resolve({ status: response.statusCode, continued, body,
          allowedOrigin: response.headers['access-control-allow-origin'] }))
        response.on('error', reject)
      })
      upload.on('continue', () => {
        continued = true
        upload.end(bytes)
      })
      upload.on('error', reject)
      upload.setTimeout(5000, () => upload.destroy(new Error('Upload response timed out')))
      if (method === 'POST') upload.flushHeaders()
      else upload.end()
    })
  }
}
